import express, { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import ejs from "ejs";
import { WebSocketServer, WebSocket } from 'ws';
import chokidar from 'chokidar';
import { createServer } from 'node:http';
import { getConfig, getProjectRoot } from "../config.js";

// Track WebSocket clients and their watched log files
const watchedLogs = new Map<WebSocket, { filePath: string; lastSize: number }>();

interface TaskStatus {
  taskId: string;
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

interface TaskDetails extends TaskStatus {
  steps?: Array<{
    name: string;
    status: string;
    duration?: number;
  }>;
  logs?: {
    [stepName: string]: {
      log?: string;
      reasoning?: string;
      raw?: string;
    };
  };
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
  stats?: {
    totalDuration?: number;
    totalDurationExcludingPauses?: number;
    totalPauseTime?: number;
    totalTokenUsage?: Record<string, any>;
  };
  branch?: string;
  folderPath?: string;
}

interface SequenceTaskInfo {
  taskId: string;
  filename: string;
  status: string;
  phase?: string;
  lastUpdate?: string;
}

interface SequenceDetails extends SequenceStatus {
  tasks: SequenceTaskInfo[];
}

// Helper function to get all task statuses
function getAllTaskStatuses(stateDir: string): TaskStatus[] {
  if (!fs.existsSync(stateDir)) {
    return [];
  }

  const files = fs.readdirSync(stateDir).filter(f => f.endsWith(".state.json"));
  const tasks: TaskStatus[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(stateDir, file), "utf8");
      const state = JSON.parse(content);
      
      // Get file modification time for lastUpdate if not in state
      const fileStat = fs.statSync(path.join(stateDir, file));
      
      tasks.push({
        taskId: state.taskId || file.replace(".state.json", ""),
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
      // Add error entry so user knows about the corrupted file
      tasks.push({
        taskId: `ERROR: ${file}`,
        phase: "error",
        lastUpdate: new Date().toISOString()
      });
    }
  }

  // Sort by last update time (newest first)
  return tasks.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}

// Helper function to get detailed task information
function getTaskDetails(stateDir: string, logsDir: string, taskId: string): TaskDetails | null {
  const stateFile = path.join(stateDir, `${taskId}.state.json`);
  
  if (!fs.existsSync(stateFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(stateFile, "utf8");
    const state = JSON.parse(content);
    const fileStat = fs.statSync(stateFile);
    
    const taskDetails: TaskDetails = {
      taskId: state.taskId || taskId,
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

    // Try to read log files
    const taskLogDir = path.join(logsDir, taskId);
    if (fs.existsSync(taskLogDir)) {
      taskDetails.logs = {};
      const logFiles = fs.readdirSync(taskLogDir);
      
      // Group log files by step name
      const stepLogs: { [stepName: string]: any } = {};
      
      for (const logFile of logFiles) {
        if (logFile.endsWith(".log") || logFile.endsWith(".reasoning.log") || logFile.endsWith(".raw.json.log")) {
          const match = logFile.match(/^\d+-(.+?)\.(log|reasoning\.log|raw\.json\.log)$/);
          if (match) {
            const [, stepName, logType] = match;
            if (!stepLogs[stepName]) {
              stepLogs[stepName] = {};
            }
            
            if (logType === "log") {
              stepLogs[stepName].log = logFile;
            } else if (logType === "reasoning.log") {
              stepLogs[stepName].reasoning = logFile;
            } else if (logType === "raw.json.log") {
              stepLogs[stepName].raw = logFile;
            }
          }
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

// Helper function to safely read log files
function readLogFile(logsDir: string, taskId: string, logFile: string): string | null {
  // Sanitize inputs to prevent directory traversal
  const sanitizedTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "");
  const sanitizedLogFile = logFile.replace(/[^a-zA-Z0-9._-]/g, "");
  
  // Only allow specific log file extensions
  if (!sanitizedLogFile.match(/\.(log|reasoning\.log|raw\.json\.log)$/)) {
    return null;
  }
  
  const logPath = path.join(logsDir, sanitizedTaskId, sanitizedLogFile);
  
  // Ensure the resolved path is within the expected directory
  const expectedDir = path.join(logsDir, sanitizedTaskId);
  if (!logPath.startsWith(expectedDir)) {
    return null;
  }
  
  try {
    if (!fs.existsSync(logPath)) {
      return null;
    }
    return fs.readFileSync(logPath, "utf8");
  } catch (error) {
    console.error(`Error reading log file ${logPath}:`, error);
    return null;
  }
}

// Helper function to find if a task is part of a sequence
function findParentSequence(stateDir: string, taskId: string): SequenceInfo | null {
  const taskStateFile = path.join(stateDir, `${taskId}.state.json`);
  
  if (!fs.existsSync(taskStateFile)) {
    return null;
  }

  try {
    // Read the task's state file to get the parentSequenceId
    const content = fs.readFileSync(taskStateFile, 'utf-8');
    const taskState = JSON.parse(content);
    
    if (!taskState.parentSequenceId) {
      return null;
    }

    // Read the corresponding sequence state file
    const sequenceStateFile = path.join(stateDir, `${taskState.parentSequenceId}.state.json`);
    if (!fs.existsSync(sequenceStateFile)) {
      return null;
    }

    const sequenceContent = fs.readFileSync(sequenceStateFile, 'utf-8');
    const sequenceState = JSON.parse(sequenceContent);
    
    // Extract folder name from sequenceId (e.g., "sequence-my-feature" -> "my-feature")
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

// Helper function to get all sequence statuses
function getAllSequenceStatuses(stateDir: string): SequenceStatus[] {
  if (!fs.existsSync(stateDir)) {
    return [];
  }

  const files = fs.readdirSync(stateDir).filter(f => f.startsWith('sequence-') && f.endsWith('.state.json'));
  const sequences: SequenceStatus[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(stateDir, file), "utf8");
      const state = JSON.parse(content);
      
      // Get file modification time for lastUpdate if not in state
      const fileStat = fs.statSync(path.join(stateDir, file));
      
      // Extract folder name from sequenceId
      const folderName = state.sequenceId?.replace('sequence-', '');
      
      sequences.push({
        sequenceId: state.sequenceId || file.replace('.state.json', ''),
        phase: state.phase || "unknown",
        lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
        stats: state.stats,
        branch: state.branch,
        folderPath: folderName
      });
    } catch (error) {
      console.error(`Error reading sequence state file ${file}:`, error);
      // Add error entry so user knows about the corrupted file
      sequences.push({
        sequenceId: `ERROR: ${file}`,
        phase: "error",
        lastUpdate: new Date().toISOString()
      });
    }
  }

  // Sort by last update time (newest first)
  return sequences.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
}

// Helper function to get detailed sequence information
function getSequenceDetails(stateDir: string, config: any, sequenceId: string): SequenceDetails | null {
  const stateFile = path.join(stateDir, `${sequenceId}.state.json`);
  
  if (!fs.existsSync(stateFile)) {
    return null;
  }

  try {
    const content = fs.readFileSync(stateFile, "utf8");
    const state = JSON.parse(content);
    const fileStat = fs.statSync(stateFile);
    
    // Extract folder name from sequenceId
    const folderName = state.sequenceId?.replace('sequence-', '');
    if (!folderName) {
      return null;
    }

    // Build the base sequence details
    const sequenceDetails: SequenceDetails = {
      sequenceId: state.sequenceId || sequenceId,
      phase: state.phase || "unknown",
      lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
      stats: state.stats,
      branch: state.branch,
      folderPath: folderName,
      tasks: []
    };

    // Find all task state files that have this sequence as their parent
    const allStateFiles = fs.readdirSync(stateDir)
      .filter(f => f.endsWith('.state.json') && !f.startsWith('sequence-'));
    
    for (const stateFileName of allStateFiles) {
      try {
        const taskStateContent = fs.readFileSync(path.join(stateDir, stateFileName), 'utf8');
        const taskState = JSON.parse(taskStateContent);
        
        // Check if this task belongs to our sequence
        if (taskState.parentSequenceId === sequenceId) {
          const taskId = taskState.taskId || stateFileName.replace('.state.json', '');
          
          // Determine status based on phase
          let taskStatus = 'pending';
          if (taskState.phase === 'running') {
            taskStatus = 'running';
          } else if (taskState.phase === 'failed') {
            taskStatus = 'failed';
          } else if (taskState.phase === 'done') {
            taskStatus = 'done';
          } else if (taskState.phase) {
            taskStatus = 'started'; // Any other phase means it's been started
          }
          
          // Try to derive filename from task ID or use task ID as filename
          let filename = taskId;
          if (folderName && taskId.includes(folderName)) {
            // Try to extract the filename part
            const parts = taskId.split('-');
            filename = parts[parts.length - 1] + '.md';
          } else {
            filename = taskId + '.md';
          }
          
          sequenceDetails.tasks.push({
            taskId: taskId,
            filename: filename,
            status: taskStatus,
            phase: taskState.phase,
            lastUpdate: taskState.lastUpdate
          });
        }
      } catch (e) {
        console.error(`Error reading task state ${stateFileName}:`, e);
      }
    }

    // Sort tasks by filename for consistent ordering
    sequenceDetails.tasks.sort((a, b) => a.filename.localeCompare(b.filename));

    return sequenceDetails;
  } catch (error) {
    console.error(`Error reading sequence details for ${sequenceId}:`, error);
    return null;
  }
}

// Wrap the server logic in an exported function
export async function startWebServer() {
  const config = await getConfig();
  const projectRoot = getProjectRoot();
  if (!config) {
    throw new Error("Configuration is null. Please ensure the configuration is properly loaded.");
  }
  const stateDir = path.resolve(projectRoot, config.statePath);
  const logsDir = path.resolve(projectRoot, config.logsPath);

  const app = express();
  const server = createServer(app);
  
  // Set view engine
  app.set("view engine", "ejs");
  app.set("views", path.resolve(new URL("../templates/web", import.meta.url).pathname));
  
  // Serve static files from public directory
  app.use(express.static(path.resolve(new URL("../public", import.meta.url).pathname)));

  // Dashboard route
  app.get("/", (_req: Request, res: Response) => {
    const tasks = getAllTaskStatuses(stateDir);
    res.render("dashboard", { tasks, page: 'dashboard' });
  });

  // Task detail route
  app.get("/task/:taskId", (req: Request, res: Response) => {
    const { taskId } = req.params;
    
    if (!taskId || typeof taskId !== "string") {
      return res.status(400).send("Invalid task ID");
    }
    
    const taskDetails = getTaskDetails(stateDir, logsDir, taskId);
    if (!taskDetails) {
      return res.status(404).send(`Task with ID '${taskId}' could not be found.`);
    }
    
    res.render("task-detail", { task: taskDetails, page: 'task-detail' });
  });

  // Live activity route
  app.get("/live", (req: Request, res: Response) => {
    const allTasks = getAllTaskStatuses(stateDir);
    const runningTask = allTasks.find(t => t.phase === 'running');
    // Fetch full details for the running task to get log file names
    const taskDetails = runningTask ? getTaskDetails(stateDir, logsDir, runningTask.taskId) : null;
    
    // Check if the running task is part of a sequence
    const parentSequence = runningTask ? findParentSequence(stateDir, runningTask.taskId) : null;
    
    res.render("live-activity", { 
      runningTask: taskDetails, 
      parentSequence: parentSequence,
      page: 'live-activity'
    });
  });

  // Sequences dashboard route
  app.get("/sequences", (_req: Request, res: Response) => {
    const sequences = getAllSequenceStatuses(stateDir);
    res.render("sequences-dashboard", { sequences, page: 'sequences-dashboard' });
  });

  // Sequence detail route
  app.get("/sequence/:sequenceId", (req: Request, res: Response) => {
    const { sequenceId } = req.params;
    
    if (!sequenceId || typeof sequenceId !== "string") {
      return res.status(400).send("Invalid sequence ID");
    }
    
    const sequenceDetails = getSequenceDetails(stateDir, config, sequenceId);
    if (!sequenceDetails) {
      return res.status(404).send(`Sequence with ID '${sequenceId}' could not be found.`);
    }
    
    res.render("sequence-detail", { sequence: sequenceDetails, page: 'sequence-detail' });
  });

  // Log file API route
  app.get("/log/:taskId/:logFile", (req: Request, res: Response) => {
    const { taskId, logFile } = req.params;
    
    if (!taskId || !logFile || typeof taskId !== "string" || typeof logFile !== "string") {
      return res.status(400).send("Invalid parameters");
    }
    
    const logContent = readLogFile(logsDir, taskId, logFile);
    if (logContent === null) {
      return res.status(404).send("Log file not found or access denied");
    }
    
    res.setHeader("Content-Type", "text/plain");
    res.send(logContent);
  });

  // API endpoint to get all sequences
  app.get("/api/sequences", (_req: Request, res: Response) => {
    try {
      const sequences = getAllSequenceStatuses(stateDir);
      res.json(sequences);
    } catch (error) {
      console.error('Error fetching sequences:', error);
      res.status(500).json({ error: 'Failed to fetch sequences' });
    }
  });

  // API endpoint to get detailed sequence information
  app.get("/api/sequences/:sequenceId", (req: Request, res: Response) => {
    const { sequenceId } = req.params;
    
    if (!sequenceId || typeof sequenceId !== "string") {
      return res.status(400).json({ error: "Invalid sequence ID" });
    }
    
    try {
      const sequenceDetails = getSequenceDetails(stateDir, config, sequenceId);
      if (!sequenceDetails) {
        return res.status(404).json({ error: `Sequence with ID '${sequenceId}' could not be found.` });
      }
      
      res.json(sequenceDetails);
    } catch (error) {
      console.error(`Error fetching sequence details for ${sequenceId}:`, error);
      res.status(500).json({ error: 'Failed to fetch sequence details' });
    }
  });

  // Create WebSocket server
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    
    // Handle incoming messages from clients
    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'watch_log') {
          const { taskId, logFile } = data;
          
          // Validate inputs
          if (!taskId || !logFile || typeof taskId !== "string" || typeof logFile !== "string") {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid taskId or logFile' }));
            return;
          }
          
          const filePath = path.join(logsDir, taskId, logFile);
          
          // Security check - ensure file path is within logs directory
          const resolvedPath = path.resolve(filePath);
          const resolvedLogsDir = path.resolve(logsDir);
          if (!resolvedPath.startsWith(resolvedLogsDir)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Access denied' }));
            return;
          }
          
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            watchedLogs.set(ws, { filePath, lastSize: stats.size });
            
            // Send initial full content
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
    
    // Handle client disconnection
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      watchedLogs.delete(ws);
    });
    
    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      watchedLogs.delete(ws);
    });
  });

  // Set up file watcher for log files
  const watcher = chokidar.watch(logsDir, { 
    persistent: true, 
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    ignoreInitial: true
  });

  watcher.on('change', (filePath: string) => {
    // Check if any client is watching this file
    for (const [ws, watchInfo] of watchedLogs.entries()) {
      if (watchInfo.filePath === filePath && ws.readyState === WebSocket.OPEN) {
        try {
          const stats = fs.statSync(filePath);
          const newSize = stats.size;

          if (newSize > watchInfo.lastSize) {
            const stream = fs.createReadStream(filePath, {
              start: watchInfo.lastSize,
              end: newSize - 1,
              encoding: 'utf-8'
            });

            let chunk = '';
            stream.on('data', (data: string | Buffer) => {
              chunk += data.toString();
            });

            stream.on('end', () => {
              if (chunk) {
                ws.send(JSON.stringify({ type: 'log_update', content: chunk }));
              }
            });

            stream.on('error', (error) => {
              console.error('Error reading log file stream:', error);
            });

            // Update the last known size
            watchInfo.lastSize = newSize;
          }
        } catch (error) {
          console.error('Error processing file change:', error);
        }
      }
    }
  });

  // Handle state file changes and broadcast updates to all clients
  const handleStateChange = (filePath: string) => {
    if (!filePath.endsWith('.state.json')) return;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stateData = JSON.parse(content);
      let messageType: string;

      if (path.basename(filePath).startsWith('sequence-')) {
        messageType = 'sequence_update';
      } else {
        messageType = 'task_update';
      }

      // Broadcast the update to all connected clients with the correct type
      for (const ws of wss.clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: messageType, data: stateData }));
        }
      }
      
      console.log(`[State Watcher] Broadcasted ${messageType} for ${path.basename(filePath)}`);
    } catch (e) {
      console.error(`[State Watcher] Failed to process state change for ${filePath}`, e);
    }
  };

  // Set up file watcher for state files
  const stateWatcher = chokidar.watch(path.join(stateDir, '*.state.json'), { 
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    ignoreInitial: true
  });
  
  stateWatcher.on('add', handleStateChange).on('change', handleStateChange);

  const port = 5177;
  server.listen(port, () => {
    console.log(pc.green(`Status web server running.`));
    console.log(pc.cyan(`›› Open http://localhost:${port} in your browser.`));
  });
}
