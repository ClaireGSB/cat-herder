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
  stdinData?: string
): Promise<{ code: number; output: string }> {
  // Build final args with JSON streaming flags
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

    // Write stdin data if provided
    if (stdinData) {
      p.stdin.write(stdinData);
      p.stdin.end();
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
          switch (json.type) {
            case "assistant":
              // Write assistant reasoning to reasoning log with timestamp
              const reasoningText = json.message?.content?.[0]?.text;
              if (reasoningText) {
                const timestamp = new Date().toISOString().replace('T', ' ').slice(0, -5);
                reasoningStream.write(`[${timestamp}] ${reasoningText}\n`);
              }
              break;
            case "result":
              // Write final result to main log and console
              const resultText = json.result;
              if (resultText) {
                process.stdout.write(resultText);
                logStream.write(resultText);
                fullOutput += resultText;
                
                // Also write to reasoning log with timestamp and prefix
                const timestamp = new Date().toISOString().replace('T', ' ').slice(0, -5);
                reasoningStream.write(`[${timestamp}] [FINAL OUTPUT] ${resultText}\n`);
              }
              break;
            default:
              // Silently ignore other JSON types (system, etc.)
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
      
      // Close reasoning stream
      reasoningStream.write(footer + footer2 + footer3);
      reasoningStream.end();
      
      resolve({ code: code ?? 1, output: fullOutput });
    });
  });
}
