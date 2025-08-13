import express, { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import ejs from "ejs";
import { getConfig, getProjectRoot } from "../config.js";

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

  const port = 5177;
  app.listen(port, () => {
    console.log(pc.green(`Status web server running.`));
    console.log(pc.cyan(`›› Open http://localhost:${port} in your browser.`));
  });
}
