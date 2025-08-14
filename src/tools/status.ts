import fs from "node:fs";
import path from "node:path";

export type Phase = "pending" | "running" | "done" | "failed" | "interrupted" | "waiting_for_reset";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export type ModelTokenUsage = {
  [modelName: string]: TokenUsage;
};
export type TaskStatus = {
  version: number;
  taskId: string;
  startTime: string;
  branch: string;
  pipeline?: string;
  parentSequenceId?: string;
  currentStep: string;
  phase: Phase;
  steps: Record<string, Phase>;
  tokenUsage: ModelTokenUsage;
  stats: {
    totalDuration: number;
    totalDurationExcludingPauses: number;
    totalPauseTime: number;
  } | null;
  lastUpdate: string;
  prUrl?: string;
  lastCommit?: string;
};

export type SequencePhase = "pending" | "running" | "done" | "failed" | "interrupted" | "waiting_for_reset";
export interface SequenceStatus {
  version: number;
  sequenceId: string;
  startTime: string;
  branch: string;
  phase: SequencePhase;
  currentTaskPath: string | null;
  completedTasks: string[];
  lastUpdate: string;
  stats: {
    totalDuration: number;
    totalDurationExcludingPauses: number;
    totalPauseTime: number;
    totalTokenUsage: ModelTokenUsage;
  } | null;
}

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
    startTime: new Date().toISOString(),
    branch: "",
    currentStep: "",
    phase: "pending",
    steps: {},
    tokenUsage: {},
    stats: null,
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

const defaultSequenceStatus: SequenceStatus = {
    version: 1,
    sequenceId: "unknown",
    startTime: new Date().toISOString(),
    branch: "",
    phase: "pending",
    currentTaskPath: null,
    completedTasks: [],
    lastUpdate: new Date().toISOString(),
    stats: null
};

export function readSequenceStatus(file: string): SequenceStatus {
    if (fs.existsSync(file)) {
        try {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
            return defaultSequenceStatus;
        }
    }
    return defaultSequenceStatus;
}

export function updateSequenceStatus(file: string, mut: (s: SequenceStatus) => void) {
    let s: SequenceStatus = readSequenceStatus(file);
    mut(s);
    s.lastUpdate = new Date().toISOString();
    writeJsonAtomic(file, s);
}

export function folderPathToSequenceId(folderPath: string): string {
    // Convert path like "claude-Tasks/my-feature" to "sequence-my-feature"
    const folderName = path.basename(path.resolve(folderPath));
    return `sequence-${folderName}`;
}