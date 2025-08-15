import express, { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { WebSocketServer, WebSocket } from 'ws';
import chokidar from 'chokidar';
import { createServer } from 'node:http';
import { getConfig, getProjectRoot } from "../config.js";
import { readJournal, JournalEvent } from "./status.js";

// Interfaces remain the same...
interface TaskStatus {
  taskId: string;
  taskPath: string;
  phase: string;
  currentStep?: string;
  lastUpdate: string;
  stats?: { totalDuration?: number; totalDurationExcludingPauses?: number; totalPauseTime?: number; };
  tokenUsage?: Record<string, any>;
  branch?: string;
  pipeline?: string;
  parentSequenceId?: string;
}

interface TaskDetails extends TaskStatus {
  steps?: Array<{ name: string; status: string; duration?: number; }>;
  logs?: { [stepName: string]: { log?: string; reasoning?: string; raw?: string; }; };
}

interface SequenceInfo {
  sequenceId: string;
  phase: string;
  folderPath?: string;
  branch?: string;
}

interface SequenceStatus {
  sequenceId: string;
  phase: string;
  lastUpdate: string;
  stats?: { totalDuration?: number; totalDurationExcludingPauses?: number; totalPauseTime?: number; totalTokenUsage?: Record<string, any>; };
  branch?: string;
  folderPath?: string;
  currentTaskPath?: string;
}

interface SequenceTaskInfo {
  taskId: string;
  taskPath: string;
  status: string;
  phase?: string;
  lastUpdate?: string;
}

interface SequenceDetails extends SequenceStatus {
  tasks: SequenceTaskInfo[];
}

// Helper functions remain the same...
function getAllTaskStatuses(stateDir: string): TaskStatus[] {
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
      tasks.push({ taskId: `ERROR: ${file}`, taskPath: "unknown", phase: "error", lastUpdate: new Date().toISOString() });
    }
  }
  return tasks.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}

function getAllSequenceStatuses(stateDir: string): SequenceStatus[] {
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
            sequences.push({ sequenceId: `ERROR: ${file}`, phase: "error", lastUpdate: new Date().toISOString() });
        }
    }
    return sequences.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}

function getTaskDetails(stateDir: string, logsDir: string, taskId: string): TaskDetails | null {
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
      steps: state.steps
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

function readLogFile(logsDir: string, taskId: string, logFile: string): string | null {
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

function findParentSequence(stateDir: string, taskId: string): SequenceInfo | null {
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

function getSequenceDetails(stateDir: string, config: any, sequenceId: string): SequenceDetails | null {
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
                    let taskStatus = 'pending';
                    if (taskState.phase === 'running') taskStatus = 'running';
                    else if (taskState.phase === 'failed') taskStatus = 'failed';
                    else if (taskState.phase === 'done') taskStatus = 'done';
                    else if (taskState.phase) taskStatus = 'started';
                    sequenceDetails.tasks.push({
                        taskId: taskState.taskId || stateFileName.replace('.state.json', ''),
                        taskPath: taskState.taskPath || 'unknown',
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

// Helper function to find the currently active task from journal events
function findActiveTaskFromJournal(journal: JournalEvent[]): JournalEvent | null {
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

// =================================================================
// --- JOURNAL-BASED HISTORY RECONSTRUCTION FUNCTIONS ---
// =================================================================

/**
 * Builds task history from journal events, maintaining chronological accuracy.
 * Enriches with details from state files when available.
 */
function buildTaskHistoryFromJournal(journal: JournalEvent[], stateDir: string): TaskStatus[] {
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
function buildSequenceHistoryFromJournal(journal: JournalEvent[], stateDir: string): SequenceStatus[] {
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

// =================================================================
// --- END OF JOURNAL-BASED HISTORY RECONSTRUCTION FUNCTIONS ---
// =================================================================


export async function startWebServer() {
  const config = await getConfig();
  const projectRoot = getProjectRoot();
  const stateDir = path.resolve(projectRoot, config.statePath);
  const logsDir = path.resolve(projectRoot, config.logsPath);

  const app = express();
  const server = createServer(app);
  
  app.set("view engine", "ejs");
  app.set("views", path.resolve(new URL("../templates/web", import.meta.url).pathname));
  app.use(express.static(path.resolve(new URL("../public", import.meta.url).pathname)));

  app.get("/", (_req: Request, res: Response) => res.redirect("/live"));

  app.get("/history", async (_req: Request, res: Response) => {
    const journal = await readJournal();
    const allTasks = buildTaskHistoryFromJournal(journal, stateDir);
    const standaloneTasks = allTasks.filter(t => !t.parentSequenceId);
    const sequences = buildSequenceHistoryFromJournal(journal, stateDir);
    res.render("history", { sequences, standaloneTasks, page: 'history' });
  });

  // =================================================================
  // --- JOURNAL-BASED /live ROUTE LOGIC ---
  // =================================================================
  app.get("/live", async (req: Request, res: Response) => {
    console.log(pc.cyan("--- [DEBUG] Executing NEW /live route handler ---")); // <-- ADD THIS
    
    const journal = await readJournal();
    console.log(pc.yellow("[DEBUG] Journal content:"), journal); // <-- ADD THIS
    
    const activeTaskEvent = findActiveTaskFromJournal(journal);
    console.log(pc.yellow("[DEBUG] Result from findActiveTaskFromJournal:"), activeTaskEvent); // <-- ADD THIS
    
    const taskDetails = activeTaskEvent 
      ? getTaskDetails(stateDir, logsDir, activeTaskEvent.id) 
      : null;
  
    console.log(pc.yellow("[DEBUG] Final taskDetails being sent to UI:"), taskDetails?.taskId || null); // <-- ADD THIS
      
    const parentSequence = activeTaskEvent?.parentId 
      ? getSequenceDetails(stateDir, config, activeTaskEvent.parentId)
      : null;
      
    res.render("live-activity", { 
      runningTask: taskDetails, 
      parentSequence: parentSequence,
      page: 'live-activity'
    });
  });
  // =================================================================
  // --- END OF JOURNAL-BASED /live ROUTE LOGIC ---
  // =================================================================

  app.get("/task/:taskId", (req: Request, res: Response) => {
    const { taskId } = req.params;
    if (!taskId || typeof taskId !== "string") return res.status(400).send("Invalid task ID");
    const taskDetails = getTaskDetails(stateDir, logsDir, taskId);
    if (!taskDetails) return res.status(404).send(`Task with ID '${taskId}' could not be found.`);
    res.render("task-detail", { task: taskDetails, page: 'task-detail' });
  });

  app.get("/sequence/:sequenceId", (req: Request, res: Response) => {
    const { sequenceId } = req.params;
    if (!sequenceId || typeof sequenceId !== "string") return res.status(400).send("Invalid sequence ID");
    const sequenceDetails = getSequenceDetails(stateDir, config, sequenceId);
    if (!sequenceDetails) return res.status(404).send(`Sequence with ID '${sequenceId}' could not be found.`);
    res.render("sequence-detail", { sequence: sequenceDetails, page: 'sequence-detail' });
  });

  app.get("/log/:taskId/:logFile", (req: Request, res: Response) => {
    const { taskId, logFile } = req.params;
    if (!taskId || !logFile || typeof taskId !== "string" || typeof logFile !== "string") return res.status(400).send("Invalid parameters");
    const logContent = readLogFile(logsDir, taskId, logFile);
    if (logContent === null) return res.status(404).send("Log file not found or access denied");
    res.setHeader("Content-Type", "text/plain");
    res.send(logContent);
  });
  
  // WebSocket and file watchers remain the same...
    const wss = new WebSocketServer({ server, path: '/ws' });
  
    wss.on('connection', (ws: WebSocket) => {
        console.log('WebSocket client connected');
        ws.on('message', (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'watch_log') {
                    const { taskId, logFile } = data;
                    if (!taskId || !logFile || typeof taskId !== "string" || typeof logFile !== "string") {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid taskId or logFile' }));
                        return;
                    }
                    const filePath = path.join(logsDir, taskId, logFile);
                    const resolvedPath = path.resolve(filePath);
                    const resolvedLogsDir = path.resolve(logsDir);
                    if (!resolvedPath.startsWith(resolvedLogsDir)) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Access denied' }));
                        return;
                    }
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        ws.send(JSON.stringify({ type: 'log_content', content }));
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Log file not found' }));
                    }
                }
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
            }
        });
        ws.on('close', () => console.log('WebSocket client disconnected'));
        ws.on('error', (error) => console.error('WebSocket error:', error));
    });
    const stateWatcher = chokidar.watch(path.join(stateDir, '*.state.json'), {
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
        ignoreInitial: true
    });
    const handleStateChange = (filePath: string) => {
        if (!filePath.endsWith('.state.json')) return;
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const stateData = JSON.parse(content);
            const messageType = path.basename(filePath).startsWith('sequence-') ? 'sequence_update' : 'task_update';
            const message = JSON.stringify({ type: messageType, data: stateData });
            for (const ws of wss.clients) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(message);
                }
            }
            console.log(`[State Watcher] Broadcasted ${messageType} for ${path.basename(filePath)}`);
        } catch (e) {
            console.error(`[State Watcher] Failed to process state change for ${filePath}`, e);
        }
    };
    stateWatcher.on('add', handleStateChange).on('change', handleStateChange);

  const port = 5177;
  server.listen(port, () => {
    console.log(pc.green(`Status web server running.`));
    console.log(pc.cyan(`›› Open http://localhost:${port} in your browser.`));
  });
}