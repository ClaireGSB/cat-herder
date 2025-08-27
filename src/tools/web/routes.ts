import express, { Request, Response, Router } from "express";
import path from "node:path";
import { readJournal, writeAnswerToFile } from "../status.js";
import { 
  buildTaskHistoryFromJournal, 
  buildSequenceHistoryFromJournal,
  getTaskDetails,
  getSequenceDetails,
  readLogFile,
  findActiveTaskFromJournal,
  findLastFinishedTaskFromJournal,
  findLastStepName,
  TaskDetails
} from "./data-access.js";
import { templateHelpers } from "./template-helpers.js";

export function createRouter(stateDir: string, logsDir: string, config: any): Router {
  const router = Router();
  
  // Add JSON middleware for parsing request bodies
  router.use(express.json());

  router.get("/", (_req: Request, res: Response) => res.redirect("/live"));

  router.get("/history", async (_req: Request, res: Response) => {
    const journal = await readJournal();
    const allTasks = buildTaskHistoryFromJournal(journal, stateDir);
    const standaloneTasks = allTasks.filter(t => !t.parentSequenceId);
    const sequences = buildSequenceHistoryFromJournal(journal, stateDir);
    res.render("history", { sequences, standaloneTasks, page: 'history', helpers: templateHelpers });
  });

  // =================================================================
  // --- JOURNAL-BASED /live ROUTE LOGIC ---
  // =================================================================
  router.get("/live", async (req: Request, res: Response) => {
    const journal = await readJournal();
    
    let taskToShow: TaskDetails | null = null;
    let parentSequence = null;
    let isLive = false;
    let initialLogContent: string | null = null;
  
    const activeTaskEvent = findActiveTaskFromJournal(journal);
    
    if (activeTaskEvent) {
        // STATE A: A task is actively running or waiting for input
        isLive = true;
        taskToShow = getTaskDetails(stateDir, logsDir, activeTaskEvent.id);
    } else {
        // STATE B: No task is running, find the last one that was touched
        isLive = false;
        const lastFinishedEvent = findLastFinishedTaskFromJournal(journal);
        if (lastFinishedEvent) {
            taskToShow = getTaskDetails(stateDir, logsDir, lastFinishedEvent.id);
        }
    }

    // --- UNIFIED LOG-LOADING LOGIC ---
    // This block now runs AFTER taskToShow is determined, regardless of live status
    if (taskToShow) {
        // 1. Find the most relevant step (now correctly handles 'waiting_for_input')
        const lastStepName = findLastStepName(taskToShow);
        
        // 2. Pre-load its reasoning log to provide immediate context in the UI
        if (lastStepName && taskToShow.logs?.[lastStepName]?.reasoning) {
            const logFile = taskToShow.logs[lastStepName].reasoning as string;
            initialLogContent = readLogFile(logsDir, taskToShow.taskId, logFile);
        }

        // 3. Find its parent sequence (existing logic)
        if (taskToShow.parentSequenceId) {
            parentSequence = getSequenceDetails(stateDir, config, taskToShow.parentSequenceId);
        }
    }
  
    res.render("live-activity", { 
      taskToShow,
      parentSequence,
      isLive,
      initialLogContent, // Pass the pre-loaded log content
      page: 'live-activity',
      helpers: templateHelpers
    });
  });
  // =================================================================
  // --- END OF JOURNAL-BASED /live ROUTE LOGIC ---
  // =================================================================

  router.get("/task/:taskId", (req: Request, res: Response) => {
    const { taskId } = req.params;
    if (!taskId || typeof taskId !== "string") return res.status(400).send("Invalid task ID");
    const taskDetails = getTaskDetails(stateDir, logsDir, taskId);
    if (!taskDetails) return res.status(404).send(`Task with ID '${taskId}' could not be found.`);
    res.render("task-detail", { task: taskDetails, page: 'task-detail', helpers: templateHelpers });
  });

  router.get("/sequence/:sequenceId", (req: Request, res: Response) => {
    const { sequenceId } = req.params;
    if (!sequenceId || typeof sequenceId !== "string") return res.status(400).send("Invalid sequence ID");
    const sequenceDetails = getSequenceDetails(stateDir, config, sequenceId);
    if (!sequenceDetails) return res.status(404).send(`Sequence with ID '${sequenceId}' could not be found.`);
    res.render("sequence-detail", { sequence: sequenceDetails, page: 'sequence-detail', helpers: templateHelpers });
  });

  router.get("/log/:taskId/:logFile", (req: Request, res: Response) => {
    const { taskId, logFile } = req.params;
    if (!taskId || !logFile || typeof taskId !== "string" || typeof logFile !== "string") return res.status(400).send("Invalid parameters");
    const logContent = readLogFile(logsDir, taskId, logFile);
    if (logContent === null) return res.status(404).send("Log file not found or access denied");
    res.setHeader("Content-Type", "text/plain");
    res.send(logContent);
  });

  // POST endpoint for submitting answers to waiting tasks
  router.post("/task/:taskId/respond", async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { answer } = req.body;

    if (!taskId || typeof taskId !== 'string' || !answer || typeof answer !== 'string') {
      return res.status(400).json({ error: "Invalid request: taskId and answer are required." });
    }

    const taskDetails = getTaskDetails(stateDir, logsDir, taskId);
    if (!taskDetails || taskDetails.phase !== 'waiting_for_input') {
      return res.status(409).json({ error: "Task is not currently waiting for input." });
    }

    try {
      await writeAnswerToFile(stateDir, taskId, answer);
      res.status(200).json({ message: "Answer submitted successfully. The task will now resume." });
    } catch (error) {
      console.error("Failed to write answer file:", error);
      res.status(500).json({ error: "Failed to process the answer." });
    }
  });

  return router;
}