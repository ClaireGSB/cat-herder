import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";
import pc from "picocolors"; // Import the colors library

export function runStreaming(
  cmd: string,
  args: string[],
  logPath: string,
  cwd: string,
  stdinData?: string,
  thoughtsLogPath?: string
): Promise<{ code: number; output: string }> {
  console.log(`[Proc] Spawning: ${cmd} ${args.join(" ")}`);
  console.log(`[Proc] Logging to: ${logPath}`);
  if (thoughtsLogPath) {
    console.log(`[Proc] Logging thoughts to: ${thoughtsLogPath}`);
  }

  // --- THIS IS THE NEWLY ADDED SECTION FOR CLI LOGGING ---
  // Log the prompt context being sent to stdin directly to the console.
  if (stdinData) {
    console.log(pc.gray("\n--- Sending Prompt Context to Claude ---"));
    // Use a dim color so it's readable but distinct from the AI's output
    console.log(pc.dim(stdinData.trim()));
    console.log(pc.gray("----------------------------------------\n"));
  }
  // --- END OF NEW SECTION ---


  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "w" });
  
  // Create thoughts log stream if path provided
  let thoughtsStream: NodeJS.WritableStream | null = null;
  if (thoughtsLogPath) {
    mkdirSync(dirname(thoughtsLogPath), { recursive: true });
    thoughtsStream = createWriteStream(thoughtsLogPath, { flags: "w" });
  }

  // Write detailed headers to the log files for later debugging
  const startTime = new Date();
  const headerInfo = `--- Log started at: ${startTime.toISOString()} ---\n--- Working directory: ${cwd} ---\n--- Command: ${cmd} ${args.join(" ")} ---\n`;
  
  logStream.write(headerInfo);
  if (thoughtsStream) {
    thoughtsStream.write(headerInfo);
    thoughtsStream.write(`--- This file contains Claude's chain of thought (thinking process) ---\n`);
  }

  if (stdinData) {
    logStream.write(`\n--- STDIN DATA ---\n`);
    logStream.write(stdinData);
    logStream.write(`--- END STDIN DATA ---\n\n`);
  }
  logStream.write(`-------------------------------------------------\n\n`);

  let fullOutput = "";
  let buffer = ""; // Buffer for parsing thinking tags across chunks
  let insideThinking = false;
  let currentThinking = "";

  function parseAndWriteChunk(chunk: string) {
    buffer += chunk;
    let cleanOutput = "";
    
    while (true) {
      if (!insideThinking) {
        // Look for opening thinking tag
        const openMatch = buffer.match(/<claude>/);
        if (openMatch) {
          // Add content before the tag to clean output
          cleanOutput += buffer.substring(0, openMatch.index);
          buffer = buffer.substring(openMatch.index! + 8); // Remove "<claude>" from buffer
          insideThinking = true;
          currentThinking = "";
        } else {
          // No opening tag found, add all buffer content to clean output
          cleanOutput += buffer;
          buffer = "";
          break;
        }
      } else {
        // Look for closing thinking tag
        const closeMatch = buffer.match(/<\/claude>/);
        if (closeMatch) {
          // Add thinking content to thoughts log
          currentThinking += buffer.substring(0, closeMatch.index);
          if (thoughtsStream) {
            thoughtsStream.write(currentThinking + "\n\n");
          }
          buffer = buffer.substring(closeMatch.index! + 9); // Remove "</claude>" from buffer
          insideThinking = false;
          currentThinking = "";
        } else {
          // No closing tag yet, add all buffer content to current thinking
          currentThinking += buffer;
          buffer = "";
          break;
        }
      }
    }
    
    return cleanOutput;
  }

  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: false, stdio: "pipe", cwd: cwd });
    
    if (stdinData) {
        p.stdin.write(stdinData);
    }
    p.stdin.end();

    p.stdout.on("data", (chunk) => {
      const chunkStr = chunk.toString();
      
      // Always show full output to console (including thinking)
      process.stdout.write(chunk);
      fullOutput += chunkStr;
      
      // Parse and separate thinking from clean output
      const cleanOutput = parseAndWriteChunk(chunkStr);
      if (cleanOutput) {
        logStream.write(cleanOutput);
      }
    });

    p.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
      fullOutput += chunk.toString();
    });

    p.on("close", (code) => {
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;

      const footer = `\n\n-------------------------------------------------\n`;
      const footer2 = `--- Process finished at: ${endTime.toISOString()} ---\n`;
      const footer3 = `--- Duration: ${duration.toFixed(2)}s, Exit Code: ${code} ---\n`;

      logStream.write(footer + footer2 + footer3);
      logStream.end();
      
      // Close thoughts stream if it exists
      if (thoughtsStream) {
        thoughtsStream.write(footer + footer2 + footer3);
        (thoughtsStream as any).end();
      }
      
      resolve({ code: code ?? 1, output: fullOutput });
    });
  });
}
