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
  // Conditionally add the new flag
  const finalArgs = thoughtsLogPath ? [...args, "--thinking-log", thoughtsLogPath] : args;

  console.log(`[Proc] Spawning: ${cmd} ${finalArgs.join(" ")}`);
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

  // Write detailed headers to the log file for later debugging
  const startTime = new Date();
  logStream.write(`--- Log started at: ${startTime.toISOString()} ---\n`);
  logStream.write(`--- Working directory: ${cwd} ---\n`);
  logStream.write(`--- Command: ${cmd} ${args.join(" ")} ---\n`);

  if (stdinData) {
    logStream.write(`\n--- STDIN DATA ---\n`);
    logStream.write(stdinData);
    logStream.write(`--- END STDIN DATA ---\n\n`);
  }
  logStream.write(`-------------------------------------------------\n\n`);

  let fullOutput = "";

  return new Promise((resolve) => {
    const p = spawn(cmd, finalArgs, { shell: false, stdio: "pipe", cwd: cwd });
    
    if (stdinData) {
        p.stdin.write(stdinData);
    }
    p.stdin.end();

    p.stdout.on("data", (chunk) => {
      // This is the real-time output from the claude command
      process.stdout.write(chunk);
      logStream.write(chunk);
      fullOutput += chunk.toString();
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
      resolve({ code: code ?? 1, output: fullOutput });
    });
  });
}
