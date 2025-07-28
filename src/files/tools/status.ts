import fs from "node:fs";
import path from "node:path";

export type Phase = "pending" | "running" | "done" | "failed" | "interrupted";
export type TaskStatus = {
  version: number;
  taskId: string;
  branch: string;
  currentStep: string;
  phase: Phase;
  steps: Record<string, Phase>;
  lastUpdate: string;
  prUrl?: string;
  lastCommit?: string;
};

function writeJsonAtomic(file: string, data: unknown) {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.tmp`);
  const json = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmp, "w");
  try { fs.writeFileSync(fd, json, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

export function updateStatus(file: string, mut: (s: TaskStatus) => void) {
  let s: TaskStatus = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : { version: 1, taskId: "unknown", branch: "", currentStep: "", phase: "pending", steps: {}, lastUpdate: new Date().toISOString() };
  mut(s);
  s.lastUpdate = new Date().toISOString();
  writeJsonAtomic(file, s);
}