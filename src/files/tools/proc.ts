import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";

export function runStreaming(cmd: string, args: string[], logPath: string): Promise<number> {
  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "a" });
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: false });
    const forward = (chunk: any) => { process.stdout.write(chunk); logStream.write(chunk); };
    p.stdout.on("data", forward);
    p.stderr.on("data", forward);
    p.on("close", (code) => { logStream.end(); resolve(code ?? 1); });
  });
}