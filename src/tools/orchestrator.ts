import { mkdirSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { updateStatus, readStatus, TaskStatus, logJournalEvent } from "./status.js";
import { getConfig, getProjectRoot } from "../config.js";
import { validatePipeline } from "./validator.js";
import { taskPathToTaskId } from "../utils/id-generation.js";
import { ensureCorrectGitBranch } from "./orchestration/git.js";
import { executePipelineForTask } from "./orchestration/pipeline-runner.js";
import { InterruptedError } from "./orchestration/step-runner.js";

// Re-export the sequence runner for backward compatibility
export { runTaskSequence } from "./orchestration/sequence-runner.js";

export async function runTask(taskRelativePath: string, pipelineOption?: string) {
  const config = await getConfig();
  if (!config) {
    throw new Error("Failed to load configuration.");
  }
  const projectRoot = getProjectRoot();
  console.log(pc.cyan(`Project root identified: ${projectRoot}`));

  // 1. Determine paths and check status FIRST.
  const taskPath = path.resolve(projectRoot, taskRelativePath);
  const taskId = taskPathToTaskId(taskPath, projectRoot);
  const statusFile = path.resolve(projectRoot, config.statePath, `${taskId}.state.json`);
  mkdirSync(path.dirname(statusFile), { recursive: true });
  const status: TaskStatus = readStatus(statusFile);

  if (status.phase === 'done') {
    console.log(pc.green(`✔ Task "${taskId}" is already complete.`));
    console.log(pc.gray("  › To re-run, delete the state file and associated branch."));
    return;
  }

  if (status.phase === 'interrupted') {
    console.log(pc.yellow(`[Orchestrator] Resuming interrupted task: "${taskId}"`));
  }

  // 2. Validate the pipeline configuration.
  const { isValid, errors } = validatePipeline(config, projectRoot);
  if (!isValid) {
    console.error(pc.red("✖ Pipeline configuration is invalid. Cannot run task.\n"));
    for (const error of errors) console.error(pc.yellow(`  - ${error}`));
    console.error(pc.cyan("\nPlease fix the errors or run 'claude-project validate' for details."));
    process.exit(1);
  }

  // 3. Ensure we are on the correct Git branch (now respects the user's config).
  const branchName = ensureCorrectGitBranch(config, projectRoot, taskPath);

  // 4. Update the status with the branch name and task path
  const relativeTaskPath = path.relative(projectRoot, taskPath);
  updateStatus(statusFile, s => {
    s.branch = branchName;
    s.taskPath = relativeTaskPath; // Ensure taskPath is always set
  });

  // 5. Log task start event
  try {
    await logJournalEvent({ eventType: 'task_started', id: taskId });
  } catch (error: any) {
    console.warn(pc.yellow(`Warning: Failed to log task start event. Error: ${error.message}`));
  }

  // 6. Execute the pipeline using the new reusable function
  let finalStatus: 'done' | 'failed' | 'interrupted' = 'done';
  try {
    await executePipelineForTask(taskPath, { pipelineOption });
  } catch (error) {
    if (error instanceof InterruptedError) {
      console.log(pc.green("\n[Orchestrator] Workflow safely interrupted and state saved."));
      finalStatus = 'interrupted';
      // Allow the finally block to run, then exit gracefully
      return; 
    }
    finalStatus = 'failed';
    throw error;
  } finally {
    // Log task finished event regardless of outcome
    try {
      await logJournalEvent({ eventType: 'task_finished', id: taskId, status: finalStatus });
    } catch (error: any) {
      console.warn(pc.yellow(`Warning: Failed to log task finish event. Error: ${error.message}`));
    }
  }

  // 7. Calculate final task statistics
  console.log(pc.cyan("\n[Orchestrator] Calculating final task statistics..."));
  updateStatus(statusFile, s => {
    if (s.phase === 'done') {
      const startTime = new Date(s.startTime).getTime();
      const endTime = new Date().getTime();
      const totalDuration = (endTime - startTime) / 1000;

      if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0 };
      const totalPauseTime = s.stats.totalPauseTime;

      s.stats.totalDuration = totalDuration;
      s.stats.totalDurationExcludingPauses = totalDuration - totalPauseTime;
    }
  });
  console.log(pc.green("[Orchestrator] Task statistics saved."));
}