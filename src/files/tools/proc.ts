import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";

export function runStreaming(cmd: string, args: string[], logPath: string): Promise<{ code: number; output: string }> {  console.log(`[Proc] Spawning: ${cmd} ${args.join(" ")}`);
  console.log(`[Proc] Logging to: ${logPath}`);

  mkdirSync(dirname(logPath), { recursive: true });
  // Use 'w' flag to overwrite the log for a fresh run, 'a' to append. 'w' is better for this workflow.
  const logStream = createWriteStream(logPath, { flags: "w" }); 

  const startTime = new Date();
  // --- Add a detailed header to the log file ---
  logStream.write(`--- Log started at: ${startTime.toISOString()} ---\n`);
  logStream.write(`--- Working directory: ${process.cwd()} ---\n`);
  logStream.write(`--- Command: ${cmd} ${args.join(" ")} ---\n`);
  logStream.write(`-------------------------------------------------\n\n`);

  let fullOutput = "";

  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: false, stdio: "pipe" });

    p.on('error', (err) => {
      const errorMsg = `[Proc] ERROR: Failed to start subprocess.`;
      console.error(errorMsg, err);
      logStream.write(`\n--- FATAL ERROR ---\n${errorMsg}\n${err.stack}\n`);
      logStream.end();
    });

    p.stdout.on("data", (chunk) => {
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
      
      // --- NEW: Add a detailed footer to the log file ---
      const footer = `\n\n-------------------------------------------------\n`;
      const footer2 = `--- Process finished at: ${endTime.toISOString()} ---\n`;
      const footer3 = `--- Duration: ${duration.toFixed(2)}s, Exit Code: ${code} ---\n`;
      
      console.log(`[Proc] Subprocess exited with code ${code}`);
      logStream.write(footer + footer2 + footer3);
      logStream.end();
      resolve({ code: code ?? 1, output: fullOutput });
    });

    p.stdin.end();
  });
}