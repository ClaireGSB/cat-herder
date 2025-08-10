import fs from "node:fs";
import path from "node:path";

export type Phase = "pending" | "running" | "done" | "failed" | "interrupted" | "waiting_for_reset";
export type TaskStatus = {
  version: number;
  taskId: string;
  branch: string;
  pipeline?: string;
  currentStep: string;
  phase: Phase;
  steps: Record<string, Phase>;
  lastUpdate: string;
  prUrl?: string;
  lastCommit?: string;
};

// This function receives an absolute path, so it doesn't need to know the project root.
function writeJsonAtomic(file: string, data: unknown) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.tmp`);
  const json = JSON.stringify(data, null, 2);
  // Use a try-finally block to ensure the file descriptor is closed.
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, json, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

const defaultStatus: TaskStatus = {
    version: 1,
    taskId: "unknown",
    branch: "",
    currentStep: "",
    phase: "pending",
    steps: {},
    lastUpdate: new Date().toISOString()
};

export function readStatus(file: string): TaskStatus {
    if (fs.existsSync(file)) {
        try {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
            return defaultStatus;
        }
    }
    return defaultStatus;
}


export function updateStatus(file: string, mut: (s: TaskStatus) => void) {
  let s: TaskStatus = readStatus(file);
  mut(s);
  s.lastUpdate = new Date().toISOString();
  writeJsonAtomic(file, s);
}