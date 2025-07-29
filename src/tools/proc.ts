import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";
import pc from "picocolors"; // Import the colors library

export function runStreaming(
  cmd: string,
  args: string[],
  logPath: string,
  thoughtsLogPath: string,
  cwd: string,
  prompt: string
): Promise<{ code: number; output: string }> {
  // Build final args with JSON streaming flags
  const finalArgs = [...args, "-p", prompt, "--output-format", "stream-json"];
  
  console.log(`[Proc] Spawning: ${cmd} ${finalArgs.join(" ")}`);
  console.log(`[Proc] Logging to: ${logPath}`);
  console.log(`[Proc] Logging thoughts to: ${thoughtsLogPath}`);

  // --- THIS IS THE NEWLY ADDED SECTION FOR CLI LOGGING ---
  // Log the prompt context being sent to Claude directly to the console.
  console.log(pc.gray("\n--- Sending Prompt Context to Claude ---"));
  // Use a dim color so it's readable but distinct from the AI's output
  console.log(pc.dim(prompt.trim()));
  console.log(pc.gray("----------------------------------------\n"));
  // --- END OF NEW SECTION ---


  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "w" });
  
  // Create thoughts log stream - now required
  mkdirSync(dirname(thoughtsLogPath), { recursive: true });
  const thoughtsStream = createWriteStream(thoughtsLogPath, { flags: "w" });

  // Write detailed headers to the log files for later debugging
  const startTime = new Date();
  const headerInfo = `--- Log started at: ${startTime.toISOString()} ---\n--- Working directory: ${cwd} ---\n--- Command: ${cmd} ${finalArgs.join(" ")} ---\n`;
  
  logStream.write(headerInfo);
  thoughtsStream.write(headerInfo);
  thoughtsStream.write(`--- This file contains Claude's chain of thought (thinking process) ---\n`);

  logStream.write(`\n--- PROMPT DATA ---\n`);
  logStream.write(prompt);
  logStream.write(`--- END PROMPT DATA ---\n\n`);
  logStream.write(`-------------------------------------------------\n\n`);

  let fullOutput = "";
  let buffer = ""; // Buffer for parsing JSON lines across chunks

  return new Promise((resolve) => {
    const p = spawn(cmd, finalArgs, { shell: false, stdio: "pipe", cwd: cwd });

    p.stdout.on("data", (chunk) => {
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        
        try {
          const json = JSON.parse(line);
          switch (json.type) {
            case "thinking":
              // Write thinking content to thoughts log
              thoughtsStream.write(json.content + "\n");
              break;
            case "tool_code":
            case "final_answer":
              // Write to main log and console
              process.stdout.write(json.content);
              logStream.write(json.content);
              fullOutput += json.content;
              break;
            default:
              // Handle other types by writing to main log
              if (json.content) {
                process.stdout.write(json.content);
                logStream.write(json.content);
                fullOutput += json.content;
              }
              break;
          }
        } catch (e) {
          // If JSON parsing fails, treat as regular output
          process.stdout.write(line + "\n");
          logStream.write(line + "\n");
          fullOutput += line + "\n";
        }
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
      
      // Close thoughts stream
      thoughtsStream.write(footer + footer2 + footer3);
      thoughtsStream.end();
      
      resolve({ code: code ?? 1, output: fullOutput });
    });
  });
}
