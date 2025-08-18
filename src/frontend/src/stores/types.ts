// TypeScript interfaces for task and sequence data structures
// Based on backend data-access.ts interfaces

export interface TaskStatus {
  taskId: string;
  taskPath: string;
  phase: string;
  currentStep?: string;
  lastUpdate: string;
  stats?: {
    totalDuration?: number;
    totalDurationExcludingPauses?: number;
    totalPauseTime?: number;
  };
  tokenUsage?: Record<string, any>;
  branch?: string;
  pipeline?: string;
  parentSequenceId?: string;
}

export interface TaskDetails extends TaskStatus {
  steps?: Array<{ name: string; status: string; duration?: number }>;
  logs?: {
    [stepName: string]: {
      log?: string;
      reasoning?: string;
      raw?: string;
    };
  };
}

export interface SequenceTaskInfo {
  taskId: string;
  taskPath: string;
  filename: string;
  status: string;
  phase?: string;
  lastUpdate?: string;
}

export interface SequenceStatus {
  sequenceId: string;
  phase: string;
  lastUpdate: string;
  stats?: {
    totalDuration?: number;
    totalDurationExcludingPauses?: number;
    totalPauseTime?: number;
    totalTokenUsage?: Record<string, any>;
  };
  branch?: string;
  folderPath?: string;
  currentTaskPath?: string;
}

export interface SequenceDetails extends SequenceStatus {
  tasks: SequenceTaskInfo[];
}

// Live activity interfaces for WebSocket updates
export interface LiveActivity {
  taskId?: string;
  sequenceId?: string;
  type: 'task' | 'sequence';
  phase: string;
  currentStep?: string;
  stepOutput?: string;
  reasoning?: string;
}

// API response interfaces
export interface HistoryResponse {
  tasks: TaskStatus[];
  sequences: SequenceStatus[];
}

export interface LiveResponse {
  isLive: boolean;
  liveTask?: TaskDetails;
  liveSequence?: SequenceDetails;
}