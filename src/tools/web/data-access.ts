import fs from "node:fs";
import path from "node:path";
// Import the comprehensive TaskStatus and SequenceStatus from the core status file.
// We also need Phase and ModelTokenUsage types for consistency.
import { 
  readJournal, 
  JournalEvent, 
  TaskStatus,       // This is the full TaskStatus from ../status.js
  SequenceStatus,   // This is the full SequenceStatus from ../status.js
  Phase,            // This is the Phase type from ../status.js
  ModelTokenUsage   // This is the ModelTokenUsage type from ../status.js
} from "../status.js";
// Using StatusPhase from ../../types.js for now, assuming it's compatible with Phase from status.js
import { ALL_STATUS_PHASES, StatusPhase } from '../../types.js'; 


// TaskDetails should extend the full TaskStatus and just add the 'logs' property.
// pendingQuestion and interactionHistory are already part of the main TaskStatus.
export interface TaskDetails extends TaskStatus {
  logs?: { [stepName: string]: { log?: string; reasoning?: string; raw?: string; }; };
}

// SequenceInfo is a lightweight interface for parent sequence links in tasks.
// Its phase should be compatible with the main SequenceStatus.
export interface SequenceInfo {
  sequenceId: string;
  phase: Phase; // Use the Phase type from ../status.js
  folderPath?: string;
  branch?: string;
}

// SequenceTaskInfo describes tasks within a sequence.
// Its status should also be compatible with the main Phase type.
export interface SequenceTaskInfo {
  taskId: string;
  taskPath: string;
  filename: string;
  status: Phase; // Use the Phase type from ../status.js
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
      
      // Ensure the object pushed matches the TaskStatus interface from ../status.js
      // Provide defaults for properties that might be missing in older state files
      tasks.push({
        version: state.version || 1, // Ensure version is present
        taskId: state.taskId || file.replace(".state.json", ""),
        taskPath: state.taskPath || "unknown",
        startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
        branch: state.branch || "",
        pipeline: state.pipeline,
        parentSequenceId: state.parentSequenceId,
        currentStep: state.currentStep || "",
        phase: state.phase || "pending", // Default to 'pending' if missing
        steps: state.steps || {}, // Ensure steps is an object
        tokenUsage: state.tokenUsage || {}, // Ensure tokenUsage is an object
        stats: state.stats || null, // Ensure stats is null or object
        lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
        prUrl: state.prUrl,
        lastCommit: state.lastCommit,
        pendingQuestion: state.pendingQuestion,
        interactionHistory: state.interactionHistory || [] // Ensure interactionHistory is an array
      });
    } catch (error) {
      console.error(`Error reading state file ${file}:`, error);
      // For errors, create a minimal TaskStatus that clearly indicates failure
      tasks.push({ 
        version: 1, taskId: `ERROR: ${file}`, taskPath: "unknown", 
        startTime: new Date().toISOString(), branch: "", currentStep: "", 
        phase: "failed", steps: {}, tokenUsage: {}, stats: null, 
        lastUpdate: new Date().toISOString(), interactionHistory: [] 
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
      const folderName = state.sequenceId?.replace('sequence-', '');

      // Ensure the object pushed matches the SequenceStatus interface from ../status.js
      sequences.push({
        version: state.version || 1, // Ensure version is present
        sequenceId: state.sequenceId || file.replace('.state.json', ''),
        startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
        branch: state.branch || "",
        phase: state.phase || "pending", // Default to 'pending' if missing
        currentTaskPath: state.currentTaskPath || null,
        completedTasks: state.completedTasks || [],
        lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
        stats: state.stats || null, // Ensure stats is null or object
      });
    } catch (error) {
      console.error(`Error reading sequence state file ${file}:`, error);
      // For errors, create a minimal SequenceStatus that clearly indicates failure
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
    
    // Construct TaskDetails object, inheriting all properties from `state`
    // and adding `logs`. This now aligns with the TaskDetails interface extending TaskStatus.
    const taskDetails: TaskDetails = {
      ...state, // Spread all properties from the parsed state
      taskId: state.taskId || taskId, // Ensure taskId is set, fallback to param
      taskPath: state.taskPath || "unknown", // Fallback for older states
      startTime: state.startTime || new Date(fileStat.birthtime).toISOString(), // Fallback
      branch: state.branch || "",
      currentStep: state.currentStep || "",
      phase: state.phase || "pending",
      steps: state.steps || {},
      tokenUsage: state.tokenUsage || {},
      stats: state.stats || null,
      lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
      interactionHistory: state.interactionHistory || [],
      // The 'logs' property is specific to TaskDetails, not in core TaskStatus
      logs: {} // Initialize logs as an empty object
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
      phase: sequenceState.phase, // This 'phase' is now directly compatible with the imported Phase
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
    
    // Construct SequenceDetails object, inheriting all properties from `state`
    // and adding the `tasks` array. This now aligns with the SequenceDetails interface.
    const sequenceDetails: SequenceDetails = {
      ...state, // Spread all properties from the parsed state
      sequenceId: state.sequenceId || sequenceId,
      startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
      branch: state.branch || "",
      phase: state.phase || "pending",
      currentTaskPath: state.currentTaskPath || null,
      completedTasks: state.completedTasks || [],
      lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
      stats: state.stats || null,
      tasks: [] // Initialize tasks as an empty array
    };

    const allStateFiles = fs.readdirSync(stateDir).filter(f => f.endsWith('.state.json') && !f.startsWith('sequence-'));
    for (const stateFileName of allStateFiles) {
      try {
        const taskStateContent = fs.readFileSync(path.join(stateDir, stateFileName), 'utf8');
        const taskState = JSON.parse(taskStateContent);
        if (taskState.parentSequenceId === sequenceId) {
          const taskPhase: Phase = taskState.phase || 'pending'; // Use imported Phase type
          let taskStatus: Phase;

          // We check if the phase from the file is a valid, known status.
          if (taskPhase && ALL_STATUS_PHASES.includes(taskPhase as any)) {
            // If it's valid, we can safely cast it and use it.
            taskStatus = taskPhase;
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
  if (!taskDetails.steps || Object.keys(taskDetails.steps).length === 0) {
    return null;
  }

  let lastDoneStepName: string | null = null;

  // Iterate over the entries (key-value pairs) of the steps object
  for (const [stepName, stepStatus] of Object.entries(taskDetails.steps)) {
    const primaryStates = ['running', 'interrupted', 'failed', 'waiting_for_input'];

    // Check if the current stepStatus is one of the primary (active) states
    if (primaryStates.includes(stepStatus)) {
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
      // Create a minimal TaskStatus object. The rest will be filled by state file.
      taskMap.set(event.id, {
        version: 1, taskId: event.id, taskPath: "unknown", 
        startTime: event.timestamp, branch: "", currentStep: "", 
        phase: "running", steps: {}, tokenUsage: {}, stats: null, 
        lastUpdate: event.timestamp, interactionHistory: [],
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
        // Merge journal data (authoritative phase/timestamp) with state file data
        enrichedTasks.push({
          ...state, // All properties from the state file
          ...taskStatus, // Overwrite with authoritative journal data if present (phase, lastUpdate)
          // Ensure mandatory properties are not undefined from older states
          version: state.version || 1,
          taskPath: state.taskPath || "unknown",
          startTime: state.startTime || taskStatus.startTime,
          branch: state.branch || "",
          currentStep: state.currentStep || "",
          steps: state.steps || {},
          tokenUsage: state.tokenUsage || {},
          stats: state.stats || null,
          interactionHistory: state.interactionHistory || []
        });
      } catch (error) {
        console.error(`Error reading state file for ${taskId}:`, error);
        enrichedTasks.push(taskStatus); // Push minimal taskStatus from journal
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
          ...state, // All properties from the state file
          ...sequenceStatus, // Overwrite with authoritative journal data (phase, lastUpdate)
          // Ensure mandatory properties are not undefined
          version: state.version || 1,
          startTime: state.startTime || sequenceStatus.startTime,
          branch: state.branch || "",
          currentTaskPath: state.currentTaskPath || null,
          completedTasks: state.completedTasks || [],
          stats: state.stats || null,
          folderPath: folderName, // This is derived/added locally, not part of core status
        });
      } catch (error) {
        console.error(`Error reading sequence state file for ${sequenceId}:`, error);
        enrichedSequences.push(sequenceStatus); // Push minimal sequenceStatus from journal
      }
    } else {
      enrichedSequences.push(sequenceStatus);
    }
  }

  // Sort by lastUpdate descending (most recent first)
  return enrichedSequences.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}