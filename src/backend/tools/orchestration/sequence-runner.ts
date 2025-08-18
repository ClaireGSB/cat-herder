import { execSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { readSequenceStatus, updateSequenceStatus, readStatus, logJournalEvent } from "../status.js";
import { getConfig, getProjectRoot } from "../../config.js";
import { folderPathToSequenceId, taskPathToTaskId } from "../../utils/id-generation.js";
import { ensureCorrectGitBranchForSequence } from "./git.js";
import { executePipelineForTask } from "./pipeline-runner.js";
import { InterruptedError } from "./errors.js";

/**
 * Finds the next available task to execute in a sequence.
 * Tasks are executed in alphabetical order by filename.
 */
export function findNextAvailableTask(folderPath: string, statusFile: string): string | null {
  const sequenceStatus = readSequenceStatus(statusFile);
  const completedTasks = sequenceStatus.completedTasks;

  try {
    // Read all .md files from the folder, ignoring files starting with _
    const files = readdirSync(folderPath)
      .filter(file => file.endsWith('.md') && !file.startsWith('_'))
      .map(file => path.resolve(folderPath, file));

    // Filter out completed tasks
    const availableTasks = files.filter(taskPath => !completedTasks.includes(taskPath));

    // Sort alphabetically and return the first one
    availableTasks.sort();

    return availableTasks.length > 0 ? availableTasks[0] : null;
  } catch (error) {
    // If folder doesn't exist or can't be read, return null
    return null;
  }
}

export async function runTaskSequence(taskFolderPath: string): Promise<void> {
  const config = await getConfig();
  if (!config) {
    throw new Error("Failed to load configuration.");
  }
  const projectRoot = getProjectRoot();
  console.log(pc.cyan(`[Sequence] Project root identified: ${projectRoot}`));

  const folderPathResolved = path.resolve(projectRoot, taskFolderPath);
  try {
    const files = readdirSync(folderPathResolved).filter(file => file.endsWith('.md') && !file.startsWith('_'));
    if (files.length === 0) {
      throw new Error(`Error: No task files (.md) found in folder: ${taskFolderPath}`);
    }
  } catch (error: any) {
    if (error.message.includes('No task files')) {
      throw error;
    }
    throw new Error(`Error: Folder does not exist or cannot be accessed: ${taskFolderPath}`);
  }

  const sequenceId = folderPathToSequenceId(taskFolderPath);
  const branchName = `claude/${sequenceId}`;
  const statusFile = path.resolve(projectRoot, config.statePath, `${sequenceId}.state.json`);
  mkdirSync(path.dirname(statusFile), { recursive: true });

  let sequenceStatus = readSequenceStatus(statusFile);
  if (sequenceStatus.sequenceId === 'unknown') {
    updateSequenceStatus(statusFile, s => {
      s.sequenceId = sequenceId;
      s.startTime = new Date().toISOString();
      s.phase = "pending";
    });
    sequenceStatus = readSequenceStatus(statusFile);
  }

  if (sequenceStatus.phase === 'interrupted') {
    console.log(pc.yellow(`[Sequence] Resuming interrupted sequence: "${sequenceId}"`));
  }

  if (config.manageGitBranch !== false) {
    const actualBranch = ensureCorrectGitBranchForSequence(branchName, projectRoot);
    updateSequenceStatus(statusFile, s => {
      s.branch = actualBranch;
    });
  } else {
    console.log(pc.yellow("[Sequence] Automatic branch management is disabled."));
    const currentBranch = execSync('git branch --show-current', { cwd: projectRoot }).toString().trim();
    console.log(pc.yellow(`[Sequence] Sequence will run on your current branch: "${currentBranch}"`));
    updateSequenceStatus(statusFile, s => {
      s.branch = currentBranch;
    });
  }

  console.log(pc.cyan(`[Sequence] Starting dynamic task sequence: ${sequenceId}`));

  try {
    await logJournalEvent({ eventType: 'sequence_started', id: sequenceId });
  } catch (error: any) {
    console.warn(pc.yellow(`Warning: Failed to log sequence start event. Error: ${error.message}`));
  }

  let nextTaskPath = findNextAvailableTask(folderPathResolved, statusFile);
  let sequenceFinalStatus: 'done' | 'failed' | 'interrupted' = 'done';

  try {
    while (nextTaskPath) {
      const nextTaskId = taskPathToTaskId(nextTaskPath, projectRoot);
      try {
        console.log(pc.cyan(`[Sequence] Starting task: ${path.basename(nextTaskPath)}`));

        try {
          await logJournalEvent({ eventType: 'task_started', id: nextTaskId, parentId: sequenceId });
        } catch (error: any) {
          console.warn(pc.yellow(`Warning: Failed to log task start event. Error: ${error.message}`));
        }

        updateSequenceStatus(statusFile, s => {
          s.currentTaskPath = nextTaskPath;
          s.phase = "running";
        });

        await executePipelineForTask(nextTaskPath, { skipGitManagement: true, sequenceStatusFile: statusFile });

        // --- SUCCESS PATH ---
        try {
          await logJournalEvent({ eventType: 'task_finished', id: nextTaskId, parentId: sequenceId, status: 'done' });
        } catch (error: any) {
          console.warn(pc.yellow(`Warning: Failed to log task finish event. Error: ${error.message}`));
        }

        const completedTaskStatusFile = path.resolve(projectRoot, config.statePath, `${nextTaskId}.state.json`);
        const completedTaskStatus = readStatus(completedTaskStatusFile);

        updateSequenceStatus(statusFile, s => {
          s.completedTasks.push(nextTaskPath!);
          s.currentTaskPath = null;
          s.phase = "pending";

          if (completedTaskStatus.tokenUsage) {
            if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0, totalTokenUsage: {} };
            if (!s.stats.totalTokenUsage) s.stats.totalTokenUsage = {};
            for (const [model, usage] of Object.entries(completedTaskStatus.tokenUsage)) {
              if (!s.stats.totalTokenUsage[model]) {
                s.stats.totalTokenUsage[model] = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
              }
              s.stats.totalTokenUsage[model].inputTokens += usage.inputTokens;
              s.stats.totalTokenUsage[model].outputTokens += usage.outputTokens;
              s.stats.totalTokenUsage[model].cacheCreationInputTokens += usage.cacheCreationInputTokens;
              s.stats.totalTokenUsage[model].cacheReadInputTokens += usage.cacheReadInputTokens;
            }
          }
        });

        console.log(pc.green(`[Sequence] Task completed: ${path.basename(nextTaskPath)}`));
        nextTaskPath = findNextAvailableTask(folderPathResolved, statusFile);

      } catch (error: any) {
        // --- ERROR / INTERRUPTION PATH ---
        
        // 1. Read the state of the task that was just interrupted/failed. It contains the partial token usage.
        const taskStatusFile = path.resolve(projectRoot, config.statePath, `${nextTaskId}.state.json`);
        const taskStatus = readStatus(taskStatusFile);
        
        // 2. ALWAYS aggregate its token usage into the sequence stats.
        updateSequenceStatus(statusFile, s => {
          if (taskStatus.tokenUsage) {
            if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0, totalTokenUsage: {} };
            if (!s.stats.totalTokenUsage) s.stats.totalTokenUsage = {};
            for (const [model, usage] of Object.entries(taskStatus.tokenUsage)) {
              if (!s.stats.totalTokenUsage[model]) {
                s.stats.totalTokenUsage[model] = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
              }
              s.stats.totalTokenUsage[model].inputTokens += usage.inputTokens;
              s.stats.totalTokenUsage[model].outputTokens += usage.outputTokens;
              s.stats.totalTokenUsage[model].cacheCreationInputTokens += usage.cacheCreationInputTokens;
              s.stats.totalTokenUsage[model].cacheReadInputTokens += usage.cacheReadInputTokens;
            }
          }
        });

        // 3. Now, differentiate the reason for stopping.
        if (error instanceof InterruptedError) {
          sequenceFinalStatus = 'interrupted';
          updateSequenceStatus(statusFile, s => { s.phase = "interrupted"; });
          try {
            await logJournalEvent({ eventType: 'task_finished', id: nextTaskId, parentId: sequenceId, status: 'interrupted' });
          } catch (logError: any) { /* silent */ }
        } else {
          console.error(pc.red(`[Sequence] HALTING: Task failed with error: ${error.message}`));
          sequenceFinalStatus = 'failed';
          updateSequenceStatus(statusFile, s => { s.phase = "failed"; });
          try {
            await logJournalEvent({ eventType: 'task_finished', id: nextTaskId, parentId: sequenceId, status: 'failed' });
          } catch (logError: any) { /* silent */ }
        }
        
        // 4. Stop the sequence by re-throwing.
        throw error;
      }
    }

    const finalStatus = readSequenceStatus(statusFile);
    if (finalStatus.phase !== 'failed' && finalStatus.phase !== 'interrupted') {
      console.log(pc.green("[Sequence] No more tasks found. All done!"));
      updateSequenceStatus(statusFile, s => {
        s.phase = "done";
        const startTime = new Date(s.startTime).getTime();
        const endTime = new Date().getTime();
        const totalDuration = (endTime - startTime) / 1000;
        if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0, totalTokenUsage: {} };
        const existingTokenUsage = s.stats.totalTokenUsage;
        const currentTotalPauseTime = s.stats.totalPauseTime;
        s.stats = {
          totalDuration,
          totalDurationExcludingPauses: totalDuration - currentTotalPauseTime,
          totalPauseTime: currentTotalPauseTime,
          totalTokenUsage: existingTokenUsage
        }
      });
    }
  } catch (error: any) {
    if (error instanceof InterruptedError) {
      return; // Exit gracefully, state is already saved.
    }
    sequenceFinalStatus = 'failed';
    throw error; // Any other error is a real failure.
  } finally {
    try {
      await logJournalEvent({ eventType: 'sequence_finished', id: sequenceId, status: sequenceFinalStatus });
    } catch (error: any) {
      console.warn(pc.yellow(`Warning: Failed to log sequence finish event. Error: ${error.message}`));
    }
  }
}