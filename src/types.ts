
export type Phase = "pending" | "running" | "done" | "failed" | "interrupted" | "waiting_for_reset" | "waiting_for_input" | "paused" | "started";

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

export interface Interaction {
  question: string;
  answer: string;
  questionTimestamp: string;
  answerTimestamp: string;
}

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
  interactionHistory: Interaction[];
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