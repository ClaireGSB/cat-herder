import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";
import pc from "picocolors"; // Import the colors library

export function runStreaming(
  cmd: string,
  args: string[],
  logPath: string,
  reasoningLogPath: string,
  cwd: string,
  stdinData?: string,
  rawJsonLogPath?: string
): Promise<{ code: number; output: string }> {
  // Build final args with JSON streaming flags and enhanced debugging
  const finalArgs = [...args, "--output-format", "stream-json", "--verbose"];
  
  console.log(`[Proc] Spawning: ${cmd} ${finalArgs.join(" ")}`);
  console.log(`[Proc] Logging to: ${logPath}`);
  console.log(`[Proc] Logging reasoning to: ${reasoningLogPath}`);

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
  
  // Create reasoning log stream - now required
  mkdirSync(dirname(reasoningLogPath), { recursive: true });
  const reasoningStream = createWriteStream(reasoningLogPath, { flags: "w" });

  // Write detailed headers to the log files for later debugging
  const startTime = new Date();
  const headerInfo = `--- Log started at: ${startTime.toISOString()} ---\n--- Working directory: ${cwd} ---\n--- Command: ${cmd} ${finalArgs.join(" ")} ---\n`;
  
  logStream.write(headerInfo);
  reasoningStream.write(headerInfo);
  reasoningStream.write(`--- This file contains Claude's step-by-step reasoning process ---\n`);

  logStream.write(`\n--- PROMPT DATA ---\n`);
  logStream.write(stdinData || "");
  logStream.write(`--- END PROMPT DATA ---\n\n`);
  logStream.write(`-------------------------------------------------\n\n`);

  let fullOutput = "";
  let buffer = ""; // Buffer for parsing JSON lines across chunks

  return new Promise((resolve) => {
    const p = spawn(cmd, finalArgs, { shell: false, stdio: "pipe", cwd: cwd });

    const spawnTimestamp = new Date().toISOString();
    // Write stdin data if provided
    if (stdinData) {
      p.stdin.write(stdinData);
      p.stdin.end();
      reasoningStream.write(`[${spawnTimestamp}] [PROCESS-DEBUG] Stdin data written and closed\n\n`);
    }

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
          
          // Log ALL JSON entries to reasoning log
          const timestamp = new Date().toISOString().replace('T', ' ').slice(0, -5);
          const contentItem = json.message?.content?.[0];
          const contentType = contentItem?.type || json.subtype || 'data';
          
          let content;
          if (contentItem?.type === 'tool_use') {
            // For tool use, show just tool name and input
            content = `${contentItem.name}(${JSON.stringify(contentItem.input)})`;
          } else {
            // For other content, use existing logic
            content = contentItem?.text || contentItem?.content || json.result || JSON.stringify(json, null, 2);
          }
          
          reasoningStream.write(`[${timestamp}] [${json.type.toUpperCase()}] [${contentType.toUpperCase()}] ${content}\n`);
          
          // Special case: also output "result" to CLI with [CLAUDE] prefix
          if (json.type === "result") {
            const resultText = json.result;
            if (resultText) {
              process.stdout.write(`[CLAUDE] ${resultText}`);
              logStream.write(resultText);
              fullOutput += resultText;
            }
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
      
      // Write stderr to reasoning log with enhanced debugging
      if (reasoningStream) {
        const timestamp = new Date().toISOString();
        reasoningStream.write(`[${timestamp}] [STDERR] Received ${chunk.toString().length} bytes\n`);
        reasoningStream.write(`[${timestamp}] [STDERR] Content: ${chunk.toString()}`);
      }
      
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
      
      // Close reasoning stream
      reasoningStream.write(footer + footer2 + footer3);
      reasoningStream.end();
      
      resolve({ code: code ?? 1, output: fullOutput });
    });
  });
}
