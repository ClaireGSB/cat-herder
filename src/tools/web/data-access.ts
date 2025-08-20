import fs from "node:fs";
import path from "node:path";
import { readJournal, JournalEvent } from "../status.js";
import { ALL_STATUS_PHASES, StatusPhase } from '../../types.js';


export interface TaskStatus {
  taskId: string;
  taskPath: string;
  phase: StatusPhase;
  currentStep?: string;
  lastUpdate: string;
  stats?: { totalDuration?: number; totalDurationExcludingPauses?: number; totalPauseTime?: number; };
  tokenUsage?: Record<string, any>;
  branch?: string;
  pipeline?: string;
  parentSequenceId?: string;
}

export interface TaskDetails extends TaskStatus {
  steps?: Array<{ name: string; status: StatusPhase; duration?: number; }>;
  logs?: { [stepName: string]: { log?: string; reasoning?: string; raw?: string; }; };
  pendingQuestion?: { question: string; timestamp: string; };
  interactionHistory: Array<{ question: string; answer: string; timestamp: string; }>;
}

export interface SequenceInfo {
  sequenceId: string;
  phase: StatusPhase;
  folderPath?: string;
  branch?: string;
}

export interface SequenceStatus {
  sequenceId: string;
  phase: StatusPhase;
  lastUpdate: string;
  stats?: { totalDuration?: number; totalDurationExcludingPauses?: number; totalPauseTime?: number; totalTokenUsage?: Record<string, any>; };
  branch?: string;
  folderPath?: string;
  currentTaskPath?: string;
}

export interface SequenceTaskInfo {
  taskId: string;
  taskPath: string;
  filename: string;
  status: StatusPhase;
  phase?: StatusPhase;
  lastUpdate?: string;
}

export interface SequenceDetails extends SequenceStatus {
  tasks: SequenceTaskInfo[];
}

export function getAllTaskStatuses(stateDir: string): TaskStatus[] {
  if (!fs.existsSync(stateDir)) return [];
  const files = fs.readdirSync(stateDir).filter(f => f.endsWith(".state.json") && !f.startsWith("sequence-"));
  const tasks: TaskStatus[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(stateDir, file), "utf8");
      const state = JSON.parse(content);
      const fileStat = fs.statSync(path.join(stateDir, file));
      tasks.push({
        taskId: state.taskId || file.replace(".state.json", ""),
        taskPath: state.taskPath || "unknown",
        phase: state.phase || "unknown",
        currentStep: state.currentStep,
        lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
        stats: state.stats,
        tokenUsage: state.tokenUsage,
        branch: state.branch,
        pipeline: state.pipeline,
        parentSequenceId: state.parentSequenceId
      });
    } catch (error) {
      console.error(`Error reading state file ${file}:`, error);
      tasks.push({ taskId: `ERROR: ${file}`, taskPath: "unknown", phase: "failed", lastUpdate: new Date().toISOString() });
    }
  }
  return tasks.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}

export function getAllSequenceStatuses(stateDir: string): SequenceStatus[] {
  if (!fs.existsSync(stateDir)) return [];
  const files = fs.readdirSync(stateDir).filter(f => f.startsWith('sequence-') && f.endsWith('.state.json'));
  const sequences: SequenceStatus[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(stateDir, file), "utf8");
      const state = JSON.parse(content);
      const fileStat = fs.statSync(path.join(stateDir, file));
      const folderName = state.sequenceId?.replace('sequence-', '');
      sequences.push({
        sequenceId: state.sequenceId || file.replace('.state.json', ''),
        phase: state.phase || "unknown",
        lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
        stats: state.stats,
        branch: state.branch,
        folderPath: folderName,
        currentTaskPath: state.currentTaskPath
      });
    } catch (error) {
      console.error(`Error reading sequence state file ${file}:`, error);
      sequences.push({ sequenceId: `ERROR: ${file}`, phase: "failed", lastUpdate: new Date().toISOString() });
    }
  }
  return sequences.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}

export function getTaskDetails(stateDir: string, logsDir: string, taskId: string): TaskDetails | null {
  const stateFile = path.join(stateDir, `${taskId}.state.json`);
  if (!fs.existsSync(stateFile)) return null;
  try {
    const content = fs.readFileSync(stateFile, "utf8");
    const state = JSON.parse(content);
    const fileStat = fs.statSync(stateFile);
    const taskDetails: TaskDetails = {
      taskId: state.taskId || taskId,
      taskPath: state.taskPath || "unknown",
      phase: state.phase || "unknown",
      currentStep: state.currentStep,
      lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
      stats: state.stats,
      tokenUsage: state.tokenUsage,
      branch: state.branch,
      pipeline: state.pipeline,
      parentSequenceId: state.parentSequenceId,
      steps: state.steps,
      pendingQuestion: state.pendingQuestion,
      interactionHistory: state.interactionHistory || []
    };
    const taskLogDir = path.join(logsDir, taskId);
    if (fs.existsSync(taskLogDir)) {
      taskDetails.logs = {};
      const logFiles = fs.readdirSync(taskLogDir);
      const stepLogs: { [stepName: string]: any } = {};
      for (const logFile of logFiles) {
        const match = logFile.match(/^\d+-(.+?)\.(log|reasoning\.log|raw\.json\.log)$/);
        if (match) {
          const [, stepName, logType] = match;
          if (!stepLogs[stepName]) stepLogs[stepName] = {};
          if (logType === "log") stepLogs[stepName].log = logFile;
          else if (logType === "reasoning.log") stepLogs[stepName].reasoning = logFile;
          else if (logType === "raw.json.log") stepLogs[stepName].raw = logFile;
        }
      }
      taskDetails.logs = stepLogs;
    }
    return taskDetails;
  } catch (error) {
    console.error(`Error reading task details for ${taskId}:`, error);
    return null;
  }
}

export function readLogFile(logsDir: string, taskId: string, logFile: string): string | null {
  const sanitizedTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "");
  const sanitizedLogFile = logFile.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!sanitizedLogFile.match(/\.(log|reasoning\.log|raw\.json\.log)$/)) return null;
  const logPath = path.join(logsDir, sanitizedTaskId, sanitizedLogFile);
  const expectedDir = path.join(logsDir, sanitizedTaskId);
  if (!path.resolve(logPath).startsWith(path.resolve(expectedDir))) return null;
  try {
    if (!fs.existsSync(logPath)) return null;
    return fs.readFileSync(logPath, "utf8");
  } catch (error) {
    console.error(`Error reading log file ${logPath}:`, error);
    return null;
  }
}

export function findParentSequence(stateDir: string, taskId: string): SequenceInfo | null {
  const taskStateFile = path.join(stateDir, `${taskId}.state.json`);
  if (!fs.existsSync(taskStateFile)) return null;
  try {
    const content = fs.readFileSync(taskStateFile, 'utf-8');
    const taskState = JSON.parse(content);
    if (!taskState.parentSequenceId) return null;
    const sequenceStateFile = path.join(stateDir, `${taskState.parentSequenceId}.state.json`);
    if (!fs.existsSync(sequenceStateFile)) return null;
    const sequenceContent = fs.readFileSync(sequenceStateFile, 'utf-8');
    const sequenceState = JSON.parse(sequenceContent);
    const folderName = sequenceState.sequenceId?.replace('sequence-', '');
    return {
      sequenceId: sequenceState.sequenceId,
      phase: sequenceState.phase,
      folderPath: folderName,
      branch: sequenceState.branch
    };
  } catch (error) {
    console.error('Error finding parent sequence:', error);
    return null;
  }
}

export function getSequenceDetails(stateDir: string, config: any, sequenceId: string): SequenceDetails | null {
  const stateFile = path.join(stateDir, `${sequenceId}.state.json`);
  if (!fs.existsSync(stateFile)) return null;
  try {
    const content = fs.readFileSync(stateFile, "utf8");
    const state = JSON.parse(content);
    const fileStat = fs.statSync(stateFile);
    const folderName = state.sequenceId?.replace('sequence-', '');
    if (!folderName) return null;
    const sequenceDetails: SequenceDetails = {
      sequenceId: state.sequenceId || sequenceId,
      phase: state.phase || "unknown",
      lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
      stats: state.stats,
      branch: state.branch,
      folderPath: folderName,
      tasks: []
    };
    const allStateFiles = fs.readdirSync(stateDir).filter(f => f.endsWith('.state.json') && !f.startsWith('sequence-'));
    for (const stateFileName of allStateFiles) {
      try {
        const taskStateContent = fs.readFileSync(path.join(stateDir, stateFileName), 'utf8');
        const taskState = JSON.parse(taskStateContent);
        if (taskState.parentSequenceId === sequenceId) {
          const taskPhase: StatusPhase = taskState.phase || 'pending';
          let taskStatus: StatusPhase;

          // We check if the phase from the file is a valid, known status.
          if (taskPhase && ALL_STATUS_PHASES.includes(taskPhase as any)) {
            // If it's valid, we can safely cast it and use it.
            taskStatus = taskPhase as StatusPhase;
          } else {
            // If it's missing, null, or an unknown value, we default to 'failed'
            // to make the problem visible in the UI and log a warning.
            if (taskPhase) { // Only log if there was an invalid value
              console.warn(`Unknown task phase encountered: '${taskPhase}'. Defaulting to 'failed'.`);
            }
            taskStatus = 'failed';
          }

          const taskPath = taskState.taskPath || 'unknown';
          sequenceDetails.tasks.push({
            taskId: taskState.taskId || stateFileName.replace('.state.json', ''),
            taskPath: taskPath,
            filename: path.basename(taskPath),
            status: taskStatus,
            phase: taskState.phase,
            lastUpdate: taskState.lastUpdate
          });
        }
      } catch (e) { console.error(`Error reading task state ${stateFileName}:`, e); }
    }
    sequenceDetails.tasks.sort((a, b) => a.taskPath.localeCompare(b.taskPath));
    return sequenceDetails;
  } catch (error) {
    console.error(`Error reading sequence details for ${sequenceId}:`, error);
    return null;
  }
}

export function findLastStepName(taskDetails: TaskDetails): string | null {
  if (!taskDetails.steps) return null;

  let lastStep: { name: string; status: string } | null = null;
  let lastDoneStep: { name: string; status: string } | null = null;

  // The order of steps in the state file isn't guaranteed, so we can't just take the last one.
  // We must find the one with the most important status.
  for (const [name, status] of Object.entries(taskDetails.steps)) {
    if (status.status === 'running' || status.status === 'interrupted' || status.status === 'failed') {
      // These are terminal or active states, this is definitely the one we want.
      return name;
    }
    if (status.status === 'done') {
      lastDoneStep = { name, status: status.status };
    }
  }

  // If we finished the loop without finding a more important status, return the last 'done' step.
  return lastDoneStep?.name || null;
}

// Helper function to find the currently active task from journal events
export function findActiveTaskFromJournal(journal: JournalEvent[]): JournalEvent | null {
  // Use a Map to track tasks that have started but not yet finished.
  // The key is the task ID, the value is the 'task_started' event object.
  const activeTasks = new Map<string, JournalEvent>();

  for (const event of journal) {
    if (event.eventType === 'task_started') {
      // When a task starts, add it to our set of active tasks.
      // If the same task ID was active before (from a failed run), this updates it
      // to the latest "started" event, which is correct.
      activeTasks.set(event.id, event);
    } else if (event.eventType === 'task_finished') {
      // When a task finishes, it's no longer active. Remove it from the map.
      activeTasks.delete(event.id);
    }
  }

  // If there are any tasks left in the map after processing the whole journal,
  // they are the ones that are currently running.
  if (activeTasks.size > 0) {
    // The map preserves insertion order. The "last" value in the map is the
    // most recently started, currently active task.
    // We convert the map values to an array and return the last element.
    return Array.from(activeTasks.values()).pop() || null;
  }

  return null; // No active tasks found.
}

/**
 * Finds the most recently finished task from the journal.
 */
export function findLastFinishedTaskFromJournal(journal: JournalEvent[]): JournalEvent | null {
  // Iterate backwards through the journal to find the newest event first.
  for (let i = journal.length - 1; i >= 0; i--) {
    const event = journal[i];
    if (event.eventType === 'task_finished') {
      return event; // Found the most recent finished task.
    }
  }
  return null; // No finished tasks in the journal.
}

/**
 * Builds task history from journal events, maintaining chronological accuracy.
 * Enriches with details from state files when available.
 */
export function buildTaskHistoryFromJournal(journal: JournalEvent[], stateDir: string): TaskStatus[] {
  const taskMap = new Map<string, TaskStatus>();

  // Process journal events chronologically to build task states
  for (const event of journal) {
    if (event.eventType === 'task_started') {
      taskMap.set(event.id, {
        taskId: event.id,
        taskPath: "unknown", // Will be enriched from state file
        phase: "running",
        lastUpdate: event.timestamp,
        parentSequenceId: event.parentId
      });
    } else if (event.eventType === 'task_finished') {
      const existingTask = taskMap.get(event.id);
      if (existingTask) {
        existingTask.phase = event.status || 'done';
        existingTask.lastUpdate = event.timestamp;
      }
    }
  }

  // Enrich with details from state files
  const enrichedTasks: TaskStatus[] = [];
  for (const [taskId, taskStatus] of taskMap.entries()) {
    const stateFile = path.join(stateDir, `${taskId}.state.json`);
    if (fs.existsSync(stateFile)) {
      try {
        const content = fs.readFileSync(stateFile, "utf8");
        const state = JSON.parse(content);
        enrichedTasks.push({
          ...taskStatus,
          taskPath: state.taskPath || taskStatus.taskPath,
          currentStep: state.currentStep,
          stats: state.stats,
          tokenUsage: state.tokenUsage,
          branch: state.branch,
          pipeline: state.pipeline,
          // Keep journal-based phase and timestamp as authoritative
        });
      } catch (error) {
        console.error(`Error reading state file for ${taskId}:`, error);
        enrichedTasks.push(taskStatus);
      }
    } else {
      enrichedTasks.push(taskStatus);
    }
  }

  // Sort by lastUpdate descending (most recent first)
  return enrichedTasks.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}

/**
 * Builds sequence history from journal events, maintaining chronological accuracy.
 * Enriches with details from state files when available.
 */
export function buildSequenceHistoryFromJournal(journal: JournalEvent[], stateDir: string): SequenceStatus[] {
  const sequenceMap = new Map<string, SequenceStatus>();

  // Process journal events chronologically to build sequence states
  for (const event of journal) {
    if (event.eventType === 'sequence_started') {
      sequenceMap.set(event.id, {
        sequenceId: event.id,
        phase: "running",
        lastUpdate: event.timestamp
      });
    } else if (event.eventType === 'sequence_finished') {
      const existingSequence = sequenceMap.get(event.id);
      if (existingSequence) {
        existingSequence.phase = event.status || 'done';
        existingSequence.lastUpdate = event.timestamp;
      }
    }
  }

  // Enrich with details from state files
  const enrichedSequences: SequenceStatus[] = [];
  for (const [sequenceId, sequenceStatus] of sequenceMap.entries()) {
    const stateFile = path.join(stateDir, `${sequenceId}.state.json`);
    if (fs.existsSync(stateFile)) {
      try {
        const content = fs.readFileSync(stateFile, "utf8");
        const state = JSON.parse(content);
        const folderName = state.sequenceId?.replace('sequence-', '');
        enrichedSequences.push({
          ...sequenceStatus,
          stats: state.stats,
          branch: state.branch,
          folderPath: folderName,
          currentTaskPath: state.currentTaskPath,
          // Keep journal-based phase and timestamp as authoritative
        });
      } catch (error) {
        console.error(`Error reading sequence state file for ${sequenceId}:`, error);
        enrichedSequences.push(sequenceStatus);
      }
    } else {
      enrichedSequences.push(sequenceStatus);
    }
  }

  // Sort by lastUpdate descending (most recent first)
  return enrichedSequences.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}