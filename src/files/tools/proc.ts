import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";

export function runStreaming(cmd: string, args: string[], logPath: string): Promise<number> {
  // New: More verbose logging
  console.log(`[Proc] Spawning: ${cmd} ${args.join(" ")}`);
  console.log(`[Proc] Logging to: ${logPath}`);

  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "a" });

  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: false, stdio: "pipe" }); // Use "pipe" for explicit control

    // CRITICAL: Listen for errors that prevent the process from starting.
    p.on('error', (err) => {
      const errorMsg = `[Proc] ERROR: Failed to start subprocess. Is "${cmd}" installed and in your PATH?`;
      console.error(errorMsg, err);
      logStream.write(`${errorMsg}\n${err.stack}\n`);
      logStream.end();
      // Don't resolve here, let the 'close' event handle it to avoid race conditions.
    });

    // Pipe stdout and stderr to both our console and the log file
    p.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
    });
    p.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });

    p.on("close", (code) => {
      console.log(`[Proc] Subprocess exited with code ${code}`);
      logStream.end();
      resolve(code ?? 1);
    });

    // THE FIX: Explicitly end the standard input stream.
    // This tells the child process "I have no interactive input for you, please proceed."
    p.stdin.end();
  });
}