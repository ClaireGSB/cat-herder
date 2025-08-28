import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { getConfig, getProjectRoot, resolveDataPath } from "../config.js";

export type Phase = "pending" | "running" | "done" | "failed" | "interrupted" | "waiting_for_reset" | "waiting_for_input" | "paused" | "started";

// Define ALL_STATUS_PHASES here, co-located with the authoritative 'Phase' type
export const ALL_STATUS_PHASES: readonly Phase[] = [
  'pending',
  'running',
  'done',
  'failed',
  'interrupted',
  'waiting_for_reset',
  'waiting_for_input',
  'paused',
  'started',
] as const;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export type ModelTokenUsage = {
  [modelName: string]: TokenUsage;
};

// Journal Event interface for run-journal.json
export interface JournalEvent {
  timestamp: string;
  eventType: 'task_started' | 'task_finished' | 'sequence_started' | 'sequence_finished';
  id: string; // taskId or sequenceId
  parentId?: string; // The sequenceId if it's a task within a sequence
  status?: 'done' | 'failed' | 'interrupted'; // Only for 'finished' events
}
export type TaskStatus = {
  version: number;
  taskId: string;
  taskPath: string;
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
  pendingQuestion?: {
    question: string;
    timestamp: string;
  };
  interactionHistory: {
    question: string;
    answer: string;
    timestamp: string;
  }[];
};

export interface SequenceStatus {
  version: number;
  sequenceId: string;
  startTime: string;
  branch: string;
  phase: Phase;
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
    version: 2,
    taskId: "unknown",
    taskPath: "unknown",
    startTime: new Date().toISOString(),
    branch: "",
    currentStep: "",
    phase: "pending",
    steps: {},
    tokenUsage: {},
    stats: null,
    lastUpdate: new Date().toISOString(),
    interactionHistory: []
};

export function readStatus(file: string): TaskStatus {
  if (fs.existsSync(file)) {
      try {
          const data = JSON.parse(fs.readFileSync(file, "utf8"));
          // Simple migration for old status files
          if (!data.taskPath) data.taskPath = "unknown";
          if (!data.version || data.version < 2) data.version = 2;
          return data;
      } catch {
          // Return a NEW copy if parsing fails
          return { ...defaultStatus };
      }
  }
  // Return a NEW copy if the file doesn't exist
  return { ...defaultStatus };
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
          return { ...defaultSequenceStatus };
      }
  }
  return { ...defaultSequenceStatus };
}

export function updateSequenceStatus(file: string, mut: (s: SequenceStatus) => void) {
    let s: SequenceStatus = readSequenceStatus(file);
    mut(s);
    s.lastUpdate = new Date().toISOString();
    writeJsonAtomic(file, s);
}

// Journal utility functions for run-journal.json

// Helper to get the journal file path
async function getJournalPath(overrideStateDir?: string): Promise<string> {
    if (overrideStateDir) {
        return path.join(overrideStateDir, 'run-journal.json');
    }
    const projectRoot = getProjectRoot();
    const config = await getConfig();
    const resolvedStatePath = resolveDataPath(config.statePath, projectRoot);
    return path.join(resolvedStatePath, 'run-journal.json');
}

// New function to read the journal
export async function readJournal(stateDir?: string): Promise<JournalEvent[]> {
    const journalPath = await getJournalPath(stateDir);
    if (!fs.existsSync(journalPath)) {
        return [];
    }
    try {
        const content = fs.readFileSync(journalPath, 'utf-8');
        return JSON.parse(content) as JournalEvent[];
    } catch (error: any) {
        console.warn(pc.yellow(`Warning: Could not read or parse run-journal.json. Starting fresh. Error: ${error.message}`));
        return [];
    }
}

// New function to log an event
export async function logJournalEvent(event: Omit<JournalEvent, 'timestamp'>): Promise<void> {
    const journalPath = await getJournalPath();
    const journal = await readJournal();
    const newEvent: JournalEvent = {
        timestamp: new Date().toISOString(),
        ...event,
    };
    journal.push(newEvent);
    try {
        writeJsonAtomic(journalPath, journal);
    } catch (error: any) {
        console.error(pc.red(`Fatal: Could not write to run-journal.json. Error: ${error.message}`));
    }
}

// =================================================================
// FILE-BASED IPC FUNCTIONS FOR UI-BASED INTERACTIVE HALTING
// =================================================================

// Helper to get the consistent path for an answer file
function getAnswerFilePath(stateDir: string, taskId: string): string {
  return path.join(stateDir, `${taskId}.answer`);
}

// Function for the web server to write the answer
export async function writeAnswerToFile(stateDir: string, taskId: string, answer: string): Promise<void> {
  const filePath = getAnswerFilePath(stateDir, taskId);
  fs.writeFileSync(filePath, answer, 'utf-8');
}

// Function for the CLI orchestrator to read (and delete) the answer
export async function readAndDeleteAnswerFile(stateDir: string, taskId: string): Promise<string | null> {
  const filePath = getAnswerFilePath(stateDir, taskId);
  if (fs.existsSync(filePath)) {
    const answer = fs.readFileSync(filePath, 'utf-8');
    fs.unlinkSync(filePath); // CRITICAL: Delete the file after reading
    return answer;
  }
  return null;
}