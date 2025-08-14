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
        pipeline: state.pipeline
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
  if (!fs.existsSync(stateDir)) {
    return null;
  }

  try {
    // Look for sequence state files
    const files = fs.readdirSync(stateDir).filter(f => f.startsWith('sequence-') && f.endsWith('.state.json'));
    
    for (const file of files) {
      const sequenceStateFile = path.join(stateDir, file);
      const content = fs.readFileSync(sequenceStateFile, 'utf-8');
      const sequenceState = JSON.parse(content);
      
      // Extract the sequence folder name from sequenceId
      // e.g., "sequence-my-feature" -> "my-feature"
      const folderName = sequenceState.sequenceId?.replace('sequence-', '');
      if (!folderName) continue;
      
      // Check if the task belongs to this sequence by looking at the taskId pattern
      // Task IDs for sequences typically contain the folder name or follow a pattern
      // that indicates they belong to the sequence folder
      if (taskId.includes(folderName)) {
        return {
          sequenceId: sequenceState.sequenceId,
          phase: sequenceState.phase,
          folderPath: folderName,
          branch: sequenceState.branch
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding parent sequence:', error);
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

  // Dashboard route
  app.get("/", (_req: Request, res: Response) => {
    const tasks = getAllTaskStatuses(stateDir);
    res.render("dashboard", { tasks });
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
    
    res.render("task-detail", { task: taskDetails });
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
      parentSequence: parentSequence 
    });
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
