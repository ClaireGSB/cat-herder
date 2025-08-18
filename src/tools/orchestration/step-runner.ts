import { readFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { runStreaming, killActiveProcess } from "../proc.js";
import { updateStatus, readStatus, updateSequenceStatus } from "../status.js"; 
import { getConfig, getProjectRoot, PipelineStep } from "../../config.js";
import { runCheck } from "../check-runner.js";
import { InterruptedError } from "./errors.js";
import { execSync } from "node:child_process";


// Global state for graceful shutdown handling
let isInterrupted = false;

// Setup interrupt handling
process.on('SIGINT', () => {
  if (isInterrupted) {
    console.log(pc.red("\n[Orchestrator] Force-exiting on second interrupt."));
    process.exit(1);
  }
  console.log(pc.yellow("\n[Orchestrator] Interruption signal received. Gracefully shutting down after this step..."));
  isInterrupted = true;
  killActiveProcess(); // This will unblock the `await runStreaming` call
});

export async function executeStep(
  stepConfig: PipelineStep,
  fullPrompt: string,
  statusFile: string,
  logFile: string,
  reasoningLogFile: string,
  rawJsonLogFile: string,
  pipelineName: string,
  sequenceStatusFile?: string
) {
  const { name, command, check, retry, model } = stepConfig;
  const projectRoot = getProjectRoot();
  const config = await getConfig();
  const maxRetries = retry ?? 0;
  let currentPrompt = fullPrompt;

  console.log(pc.cyan(`
[Orchestrator] Starting step: ${name}`));

  const status = readStatus(statusFile);

  if (status.steps[name] === 'interrupted') {
    console.log(pc.yellow(`[Orchestrator] Resuming interrupted step: "${name}"`));
  }

  updateStatus(statusFile, s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (attempt > 1) {
      console.log(pc.yellow(`
[Orchestrator] Retry attempt ${attempt}/${maxRetries} for step: ${name}`));
    }

    // Set shutdown state before running the process
    // Extract taskId from statusFile name and sequenceId from sequenceStatusFile if available
    const taskId = path.basename(statusFile, '.state.json');
    const sequenceId = sequenceStatusFile ? path.basename(sequenceStatusFile, '.state.json') : undefined;

    const result = await runStreaming("claude", [`/project:${command}`], logFile, reasoningLogFile, projectRoot, currentPrompt, rawJsonLogFile, model, { pipelineName, settings: config });
    const partialTokenUsage = result.tokenUsage;
    const modelName = result.modelUsed || model || 'default';

    // ALWAYS perform a state update after a run, even if it was interrupted.
    updateStatus(statusFile, s => {
      // 1. Aggregate any tokens that were used before the interruption.
      if (partialTokenUsage) {
        if (!s.tokenUsage) s.tokenUsage = {};
        if (!s.tokenUsage[modelName]) {
          s.tokenUsage[modelName] = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
        }
        s.tokenUsage[modelName].inputTokens += partialTokenUsage.input_tokens;
        s.tokenUsage[modelName].outputTokens += partialTokenUsage.output_tokens;
        s.tokenUsage[modelName].cacheCreationInputTokens += partialTokenUsage.cache_creation_input_tokens;
        s.tokenUsage[modelName].cacheReadInputTokens += partialTokenUsage.cache_read_input_tokens;
      }

      // 2. If interrupted, set the final state here.
      if (isInterrupted) {
        s.phase = "interrupted";
        if (s.steps[name] === "running") {
          s.steps[name] = "interrupted";
        }
      }
    });


    // 3. Now that the state is securely written, throw to stop the pipeline.
    if (isInterrupted) {
      throw new InterruptedError("Process was interrupted by the user.");
    }

    if (result.rateLimit) {
      const config = await getConfig();
      const resetTime = new Date(result.rateLimit.resetTimestamp * 1000);

      if (config.waitForRateLimitReset) {
        const waitMs = resetTime.getTime() - Date.now();
        if (waitMs > 0) {
          console.log(pc.yellow(`[Orchestrator] Claude API usage limit reached.`));

          if (waitMs > 28800000) {
            console.log(pc.red(`[Orchestrator] WARNING: API reset is scheduled for ${resetTime.toLocaleString()}. The process will pause for over 8 hours.`));
            console.log(pc.yellow(`[Orchestrator] You can safely terminate with Ctrl+C and restart manually after the reset time.`));
          }

          console.log(pc.cyan(`  › Pausing and will auto-resume at ${resetTime.toLocaleTimeString()}.`));

          // --- ADD PAUSE TIME TRACKING ---
          const pauseInSeconds = waitMs / 1000;
          updateStatus(statusFile, s => {
            s.phase = "waiting_for_reset";
            if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0 };
            s.stats.totalPauseTime += pauseInSeconds;
          });

          if (sequenceStatusFile) {
            updateSequenceStatus(sequenceStatusFile, s => {
              (s.phase as any) = "waiting_for_reset";
              if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0, totalTokenUsage: {} };
              s.stats.totalPauseTime += pauseInSeconds;
            });
          }
          // --- END PAUSE TIME TRACKING ---

          await new Promise(resolve => setTimeout(resolve, waitMs));

          console.log(pc.green(`[Orchestrator] Resuming step: ${name}`));
          updateStatus(statusFile, s => { s.phase = "running"; });
          if (sequenceStatusFile) {
            updateSequenceStatus(sequenceStatusFile, s => { s.phase = "running"; });
          }

          const reasoningLogContent = readFileSync(reasoningLogFile, 'utf-8');
          const resumePrompt = `You are resuming an automated task that was interrupted by an API usage limit. Your progress up to the point of interruption has been saved. Your goal is to review your previous actions and continue the task from where you left off.\n\n--- ORIGINAL INSTRUCTIONS ---\n${fullPrompt}\n--- END ORIGINAL INSTRUCTIONS ---\n\n--- PREVIOUS ACTIONS LOG ---\n${reasoningLogContent}\n--- END PREVIOUS ACTIONS LOG ---\n\nPlease analyze the original instructions and your previous actions, then continue executing the plan to complete the step.`;

          currentPrompt = resumePrompt;
          attempt--;
          continue;
        }
      } else {
        updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
        throw new Error(`Workflow failed: Claude AI usage limit reached. Your limit will reset at ${resetTime.toLocaleString()}.\nTo automatically wait and resume, set 'waitForRateLimitReset: true' in your claude.config.js.\nYou can re-run the command after the reset time to continue from this step.`);
      }
    }

    if (result.code !== 0) {
      updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
      throw new Error(`Step "${name}" failed. Check the output log for details: ${logFile}\nAnd the reasoning log: ${reasoningLogFile}`);
    }

    const checkResult = await runCheck(check, projectRoot);

    if (checkResult.success) {
      if (config.autoCommit) {
        console.log(`[Orchestrator] Committing checkpoint for step: ${name}`);
        execSync(`git add -A`, { stdio: "inherit", cwd: projectRoot });
        execSync(`git commit -m "chore(${name}): checkpoint"`, { stdio: "inherit", cwd: projectRoot });
      } else {
        console.log(pc.gray(`[Orchestrator] Step "${name}" successful. Auto-commit is disabled.`));
      }
      updateStatus(statusFile, s => { s.phase = "pending"; s.steps[name] = "done"; });
      return;
    }

    console.log(pc.red(`[Orchestrator] Check failed for step "${name}" (attempt ${attempt}/${maxRetries + 1})`));

    if (attempt > maxRetries) {
      updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
      throw new Error(`Step "${name}" failed after ${maxRetries} retries. Final check error: ${checkResult.output || 'Check validation failed'}`);
    }

    console.log(pc.yellow(`[Orchestrator] Generating  feedback for step: ${name}`));
    const checkDescription = Array.isArray(check)
      ? 'One of the validation checks'
      : `The validation check`;

    const feedbackPrompt = `Your previous attempt to complete the '${name}' step failed its validation check.\n\nHere are the original instructions you were given for this step:
--- ORIGINAL INSTRUCTIONS ---\n${fullPrompt}\n--- END ORIGINAL INSTRUCTIONS ---\n\n${checkDescription} failed with the following error output:
--- ERROR OUTPUT ---\n${checkResult.output || 'No output captured'}\n--- END ERROR OUTPUT ---\n\nPlease re-attempt the task. Your goal is to satisfy the **original instructions** while also fixing the error reported above. Analyze both the original goal and the specific failure. Do not modify the tests or checks.`;

    currentPrompt = feedbackPrompt;
  }
}