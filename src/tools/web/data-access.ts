import fs from "node:fs";
import path from "node:path";
// Import all necessary types and functions from the core status file.
import {
  readJournal,
  JournalEvent,
  TaskStatus,       // Full TaskStatus from ../status.js
  SequenceStatus,   // Full SequenceStatus from ../status.js
  Phase,            // Canonical Phase type from ../status.js
  ModelTokenUsage,  // ModelTokenUsage type from ../status.js
  ALL_STATUS_PHASES // Canonical ALL_STATUS_PHASES from ../status.js
} from "../status.js";
// IMPORTANT: No more imports from '../../types.js' here.


// TaskDetails extends the full TaskStatus and just adds the 'logs' property.
export interface TaskDetails extends TaskStatus {
  logs?: { [stepName: string]: { log?: string; reasoning?: string; raw?: string; }; };
}

// SequenceInfo is a lightweight interface for parent sequence links in tasks.
export interface SequenceInfo {
  sequenceId: string;
  phase: Phase;
  folderPath?: string;
  branch?: string;
}

// SequenceTaskInfo describes tasks within a sequence.
export interface SequenceTaskInfo {
  taskId: string;
  taskPath: string;
  filename: string;
  status: Phase;
  phase?: Phase; // Optional, can be same as status but kept for consistency with original
  lastUpdate?: string;
}

// SequenceDetails extends the full SequenceStatus and adds the 'tasks' array.
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

      // Construct TaskStatus object, ensuring all properties are explicitly set
      // with fallbacks for older state file formats.
      tasks.push({
        version: state.version || 2, // Default to version 2
        taskId: state.taskId || file.replace(".state.json", ""),
        taskPath: state.taskPath || "unknown",
        startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
        branch: state.branch || "",
        pipeline: state.pipeline || undefined,
        parentSequenceId: state.parentSequenceId || undefined,
        currentStep: state.currentStep || "",
        phase: (state.phase && ALL_STATUS_PHASES.includes(state.phase as Phase)) ? state.phase : "pending",
        steps: state.steps || {},
        tokenUsage: state.tokenUsage || {},
        stats: state.stats || null,
        lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
        prUrl: state.prUrl || undefined,
        lastCommit: state.lastCommit || undefined,
        pendingQuestion: state.pendingQuestion || undefined,
        interactionHistory: state.interactionHistory || []
      });
    } catch (error) {
      console.error(`Error reading state file ${file}:`, error);
      // For errors, create a minimal but valid TaskStatus object
      tasks.push({
        version: 2, taskId: `ERROR: ${file}`, taskPath: "unknown",
        startTime: new Date().toISOString(), branch: "", currentStep: "",
        phase: "failed", steps: {}, tokenUsage: {}, stats: null,
        lastUpdate: new Date().toISOString(), interactionHistory: [],
        pipeline: undefined, parentSequenceId: undefined, prUrl: undefined, lastCommit: undefined, pendingQuestion: undefined
      });
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

      // Construct SequenceStatus object, ensuring all properties are explicitly set
      // with fallbacks for older state file formats.
      sequences.push({
        version: state.version || 1,
        sequenceId: state.sequenceId || file.replace('.state.json', ''),
        startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
        branch: state.branch || "",
        phase: (state.phase && ALL_STATUS_PHASES.includes(state.phase as Phase)) ? state.phase : "pending",
        currentTaskPath: state.currentTaskPath || null,
        completedTasks: state.completedTasks || [],
        lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
        stats: state.stats || null,
      });
    } catch (error) {
      console.error(`Error reading sequence state file ${file}:`, error);
      // For errors, create a minimal but valid SequenceStatus object
      sequences.push({
        version: 1, sequenceId: `ERROR: ${file}`, startTime: new Date().toISOString(),
        branch: "", phase: "failed", currentTaskPath: null, completedTasks: [],
        lastUpdate: new Date().toISOString(), stats: null
      });
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

    // Create a base TaskStatus object with defaults to ensure all required fields are present
    const baseTask: TaskStatus = {
      version: state.version || 2,
      taskId: state.taskId || taskId,
      taskPath: state.taskPath || "unknown",
      startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
      branch: state.branch || "",
      pipeline: state.pipeline || undefined,
      parentSequenceId: state.parentSequenceId || undefined,
      currentStep: state.currentStep || "",
      phase: (state.phase && ALL_STATUS_PHASES.includes(state.phase as Phase)) ? state.phase : "pending",
      steps: state.steps || {},
      tokenUsage: state.tokenUsage || {},
      stats: state.stats || null,
      lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
      prUrl: state.prUrl || undefined,
      lastCommit: state.lastCommit || undefined,
      pendingQuestion: state.pendingQuestion || undefined,
      interactionHistory: state.interactionHistory || []
    };

    // Construct TaskDetails object from baseTask and add the 'logs' property
    const taskDetails: TaskDetails = {
      ...baseTask,
      logs: {} // Initialize logs as an empty object, specific to TaskDetails
    };

    const taskLogDir = path.join(logsDir, taskId);
    if (fs.existsSync(taskLogDir)) {
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
  // Basic sanity check to prevent directory traversal
  if (!sanitizedLogFile.match(/^[a-zA-Z0-9._-]+$/)) return null;
  if (sanitizedLogFile.includes('..') || sanitizedLogFile.includes('/') || sanitizedLogFile.includes('\\')) return null;

  const logPath = path.join(logsDir, sanitizedTaskId, sanitizedLogFile);
  const expectedDir = path.join(logsDir, sanitizedTaskId);
  // Ensure the resolved path is within the expected log directory
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
      phase: (sequenceState.phase && ALL_STATUS_PHASES.includes(sequenceState.phase as Phase)) ? sequenceState.phase : "pending",
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

    // Create a base SequenceStatus object with defaults to ensure all required fields are present
    const baseSequence: SequenceStatus = {
      version: state.version || 1,
      sequenceId: state.sequenceId || sequenceId,
      startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
      branch: state.branch || "",
      phase: (state.phase && ALL_STATUS_PHASES.includes(state.phase as Phase)) ? state.phase : "pending",
      currentTaskPath: state.currentTaskPath || null,
      completedTasks: state.completedTasks || [],
      lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
      stats: state.stats || null,
    };

    // Construct SequenceDetails object from baseSequence and add the 'tasks' array.
    const sequenceDetails: SequenceDetails = {
      ...baseSequence,
      tasks: [] // Initialize tasks as an empty array, specific to SequenceDetails
    };

    const allStateFiles = fs.readdirSync(stateDir).filter(f => f.endsWith('.state.json') && !f.startsWith('sequence-'));
    for (const stateFileName of allStateFiles) {
      try {
        const taskStateContent = fs.readFileSync(path.join(stateDir, stateFileName), 'utf8');
        const taskState = JSON.parse(taskStateContent);
        if (taskState.parentSequenceId === sequenceId) {
          const taskPhase: Phase = (taskState.phase && ALL_STATUS_PHASES.includes(taskState.phase as Phase)) ? taskState.phase : 'pending';
          let taskStatus: Phase = taskPhase; // Directly use the validated taskPhase

          const taskPath = taskState.taskPath || 'unknown';
          sequenceDetails.tasks.push({
            taskId: taskState.taskId || stateFileName.replace('.state.json', ''),
            taskPath: taskPath,
            filename: path.basename(taskPath),
            status: taskStatus,
            phase: taskState.phase, // Keep original phase for display if it was 'unknown' or broader
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
  if (!taskDetails.steps || Object.keys(taskDetails.steps).length === 0) {
    return null;
  }

  let lastDoneStepName: string | null = null;

  // Iterate over the entries (key-value pairs) of the steps object
  for (const [stepName, stepStatus] of Object.entries(taskDetails.steps)) {
    const primaryStates = ['running', 'interrupted', 'failed', 'waiting_for_input'] as const; // Explicitly type this array

    // Check if the current stepStatus is one of the primary (active) states
    if (primaryStates.includes(stepStatus as any)) {
      return stepName; // Return the name of the active step immediately
    }

    if (stepStatus === 'done') {
      lastDoneStepName = stepName; // Keep track of the last completed step
    }
  }

  // If no active step was found, return the last completed one.
  return lastDoneStepName;
}

// Helper function to find the currently active task from journal events
export function findActiveTaskFromJournal(journal: JournalEvent[]): JournalEvent | null {
  const activeTasks = new Map<string, JournalEvent>();

  for (const event of journal) {
    if (event.eventType === 'task_started') {
      activeTasks.set(event.id, event);
    } else if (event.eventType === 'task_finished') {
      activeTasks.delete(event.id);
    }
  }

  if (activeTasks.size > 0) {
    return Array.from(activeTasks.values()).pop() || null;
  }

  return null;
}

/**
 * Finds the most recently finished task from the journal.
 */
export function findLastFinishedTaskFromJournal(journal: JournalEvent[]): JournalEvent | null {
  for (let i = journal.length - 1; i >= 0; i--) {
    const event = journal[i];
    if (event.eventType === 'task_finished') {
      return event;
    }
  }
  return null;
}

/**
 * Builds task history from journal events, maintaining chronological accuracy.
 * Enriches with details from state files when available.
 */
export function buildTaskHistoryFromJournal(journal: JournalEvent[], stateDir: string): TaskStatus[] {
  const taskMap = new Map<string, TaskStatus>();

  for (const event of journal) {
    if (event.eventType === 'task_started') {
      // Create a minimal TaskStatus object. The rest will be filled by state file.
      taskMap.set(event.id, {
        version: 2, taskId: event.id, taskPath: "unknown",
        startTime: event.timestamp, branch: "", currentStep: "",
        phase: "running", steps: {}, tokenUsage: {}, stats: null,
        lastUpdate: event.timestamp, interactionHistory: [],
        pipeline: undefined, parentSequenceId: event.parentId, prUrl: undefined, lastCommit: undefined, pendingQuestion: undefined
      });
    } else if (event.eventType === 'task_finished') {
      const existingTask = taskMap.get(event.id);
      if (existingTask) {
        existingTask.phase = event.status || 'done';
        existingTask.lastUpdate = event.timestamp;
      }
    }
  }

  const enrichedTasks: TaskStatus[] = [];
  for (const [taskId, taskStatus] of taskMap.entries()) {
    const stateFile = path.join(stateDir, `${taskId}.state.json`);
    if (fs.existsSync(stateFile)) {
      try {
        const content = fs.readFileSync(stateFile, "utf8");
        const state = JSON.parse(content);
        enrichedTasks.push({
          ...state, // All properties from the state file
          ...taskStatus, // Overwrite with authoritative journal data if present (phase, lastUpdate)
          // Explicitly ensure optional properties are handled
          version: state.version || 2,
          taskPath: state.taskPath || "unknown",
          startTime: state.startTime || taskStatus.startTime,
          branch: state.branch || "",
          currentStep: state.currentStep || "",
          steps: state.steps || {},
          tokenUsage: state.tokenUsage || {},
          stats: state.stats || null,
          interactionHistory: state.interactionHistory || [],
          pipeline: state.pipeline || undefined,
          parentSequenceId: state.parentSequenceId || undefined,
          prUrl: state.prUrl || undefined,
          lastCommit: state.lastCommit || undefined,
          pendingQuestion: state.pendingQuestion || undefined,
        });
      } catch (error) {
        console.error(`Error reading state file for ${taskId}:`, error);
        enrichedTasks.push(taskStatus);
      }
    } else {
      enrichedTasks.push(taskStatus);
    }
  }

  return enrichedTasks.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}

/**
 * Builds sequence history from journal events, maintaining chronological accuracy.
 * Enriches with details from state files when available.
 */
export function buildSequenceHistoryFromJournal(journal: JournalEvent[], stateDir: string): SequenceStatus[] {
  const sequenceMap = new Map<string, SequenceStatus>();

  for (const event of journal) {
    if (event.eventType === 'sequence_started') {
      sequenceMap.set(event.id, {
        version: 1, sequenceId: event.id, startTime: event.timestamp,
        branch: "", phase: "running", currentTaskPath: null,
        completedTasks: [], lastUpdate: event.timestamp, stats: null
      });
    } else if (event.eventType === 'sequence_finished') {
      const existingSequence = sequenceMap.get(event.id);
      if (existingSequence) {
        existingSequence.phase = event.status || 'done';
        existingSequence.lastUpdate = event.timestamp;
      }
    }
  }

  const enrichedSequences: SequenceStatus[] = [];
  for (const [sequenceId, sequenceStatus] of sequenceMap.entries()) {
    const stateFile = path.join(stateDir, `${sequenceId}.state.json`);
    if (fs.existsSync(stateFile)) {
      try {
        const content = fs.readFileSync(stateFile, "utf8");
        const state = JSON.parse(content);
        const folderName = state.sequenceId?.replace('sequence-', '');
        enrichedSequences.push({
          ...state, // All properties from the state file
          ...sequenceStatus, // Overwrite with authoritative journal data (phase, lastUpdate)
          // Ensure mandatory properties are not undefined
          version: state.version || 1,
          startTime: state.startTime || sequenceStatus.startTime,
          branch: state.branch || "",
          currentTaskPath: state.currentTaskPath || null,
          completedTasks: state.completedTasks || [],
          stats: state.stats || null,
          // folderPath is not part of core SequenceStatus, so handle it separately
          folderPath: folderName || undefined,
        });
      } catch (error) {
        console.error(`Error reading sequence state file for ${sequenceId}:`, error);
        enrichedSequences.push(sequenceStatus);
      }
    } else {
      enrichedSequences.push(sequenceStatus);
    }
  }

  return enrichedSequences.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}