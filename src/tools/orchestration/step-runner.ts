import fs, { readFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import readline from "node:readline";
import { runStreaming, killActiveProcess } from "../proc.js";
import { updateStatus, readStatus, updateSequenceStatus, readAndDeleteAnswerFile } from "../status.js";
import { getConfig, getProjectRoot, PipelineStep } from "../../config.js";
import { runCheck } from "../check-runner.js";
import { InterruptedError, HumanInterventionRequiredError } from "./errors.js";
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

// Utility function to wait for human input from either CLI or web UI
async function waitForHumanInput(question: string, stateDir: string, taskId: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let pollingInterval: NodeJS.Timeout | null = null;

  // Promise 1: CLI Input
  const cliPromise = new Promise<string>((resolve, reject) => {
    console.log(pc.cyan("\n[Orchestrator] Task has been paused. The AI needs your input.\n"));
    console.log(pc.yellow("🤖 QUESTION:"));
    console.log(question);
    console.log("\n(You can answer here in the CLI or in the web dashboard.)\n");

    rl.question(pc.blue("Your answer: "), (answer) => {
      resolve(answer.trim());
    });

    // Handle Ctrl+C during input
    rl.on('SIGINT', () => {
      console.log(pc.yellow("\n[Orchestrator] Input interrupted. Task will remain in waiting_for_input state."));
      reject(new InterruptedError("User interrupted input"));
    });
  });

  // Promise 2: File-based Input
  const ipcPromise = new Promise<string>((resolve) => {
    pollingInterval = setInterval(async () => {
      const answer = await readAndDeleteAnswerFile(stateDir, taskId);
      if (answer !== null) {
        console.log(pc.cyan("\n[Orchestrator] Answer received from web UI. Resuming..."));
        resolve(answer);
      }
    }, 1000); // Check every second
  });

  try {
    // Race the two promises
    const answer = await Promise.race([cliPromise, ipcPromise]);
    return answer;
  } finally {
    // CRITICAL CLEANUP
    if (pollingInterval) clearInterval(pollingInterval);
    rl.close();
  }
}

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
  let feedbackForNextRun: string | null = null;

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

    // Interactive loop to handle human intervention
    let needsResume = true;
    let result: any;
    let partialTokenUsage: any;
    let modelName: string;

    while (needsResume) {
      try {
        // --- START PROMPT CONSTRUCTION FOR THIS runStreaming CALL ---
        let previousReasoningForPrompt = '';
        if (fs.existsSync(reasoningLogFile)) {
          const fullLogContent = fs.readFileSync(reasoningLogFile, 'utf-8');
          const logLines = fullLogContent.split('\n');
          let filteredLines: string[] = [];
          let inReasoningSection = false;

          // Iterate in reverse to find the latest actual reasoning section
          // Filters out headers, footers, and internal debug lines added by proc.ts
          for (let i = logLines.length - 1; i >= 0; i--) {
            const line = logLines[i];
            if (line.includes('--- Process finished at:') || line.includes('--- Token Usage ---') || line.includes('--- PROMPT DATA ---')) {
              continue; // These are footers or start of input prompt data, skip them
            }
            if (line.includes('=================================================')) {
              break; // Found a header separator. This marks the end of the previous reasoning block. Stop.
            }
            if (line.includes('[PROCESS-DEBUG] Stdin data written and closed')) {
              continue; // Internal debug line, skip
            }
            if (line.includes("--- This file contains Claude's step-by-step reasoning process ---")) {
              inReasoningSection = true; // Found the reasoning intro line, start collecting
              continue;
            }
            if (inReasoningSection && line.trim() !== '') {
              filteredLines.unshift(line); // Add to the beginning to maintain original order
            }
          }
          previousReasoningForPrompt = filteredLines.join('\n').trim();
        }

        let promptParts: string[] = [fullPrompt]; // Always start with the original instructions for the step.

        if (previousReasoningForPrompt) {
          promptParts.push(`--- PREVIOUS ACTIONS LOG ---\n${previousReasoningForPrompt}\n--- END PREVIOUS ACTIONS LOG ---`);
        }

        if (feedbackForNextRun) {
          promptParts.push(`--- FEEDBACK ---\n${feedbackForNextRun}\n--- END FEEDBACK ---`);
          feedbackForNextRun = null; // Consume the feedback for this run
        }

        // Add a general instruction for continuation/action
        promptParts.push(`Please analyze the provided information and continue executing the plan to complete the step.`);
        const promptToUse = promptParts.join("\n\n");
        // --- END PROMPT CONSTRUCTION ---

        // Use Promise.race to monitor both the AI process and state changes
        const stateDir = path.dirname(statusFile);
        const runningPromise = runStreaming("claude", [`/project:${command}`], logFile, reasoningLogFile, projectRoot, promptToUse, rawJsonLogFile, model, { pipelineName, settings: config }, taskId);

        let pollInterval: NodeJS.Timeout | null = null;

        // Promise that resolves when state becomes 'waiting_for_input'
        const statePollingPromise = new Promise<never>((resolve, reject) => {
          pollInterval = setInterval(() => {
            const currentStatus = readStatus(statusFile);
            if (currentStatus.phase === 'waiting_for_input' && currentStatus.pendingQuestion) {
              clearInterval(pollInterval!);
              killActiveProcess(); // Kill the Claude process
              reject(new HumanInterventionRequiredError(currentStatus.pendingQuestion.question));
            }
          }, 500); // Poll every 500ms
        });

        try {
          result = await Promise.race([runningPromise, statePollingPromise]);
        } finally {
          // Clean up polling interval
          if (pollInterval) {
            clearInterval(pollInterval);
          }
        }
        partialTokenUsage = result.tokenUsage;
        modelName = result.modelUsed || model || 'default';
        needsResume = false; // If it finishes without error, exit loop
      } catch (error) {
        if (error instanceof HumanInterventionRequiredError) {
          // 1. PAUSE: Update task, step, AND sequence status to 'waiting_for_input'
          updateStatus(statusFile, s => {
            s.phase = 'waiting_for_input';
            s.steps[name] = 'waiting_for_input'; // Set the current step's status
            s.pendingQuestion = {
              question: error.question,
              timestamp: new Date().toISOString()
            };
          });

          if (sequenceStatusFile) {
            try {
              updateSequenceStatus(sequenceStatusFile, s => { s.phase = 'waiting_for_input'; });
            } catch (seqError) {
              console.log(pc.yellow(`[Orchestrator] Warning: Could not update sequence status to waiting_for_input: ${seqError}`));
            }
          }

          try {
            // 2. PROMPT: Ask the user the question in CLI or web UI
            const stateDir = path.dirname(statusFile);
            const pauseStartTime = Date.now();
            const answer = await waitForHumanInput(error.question, stateDir, taskId);
            const pauseDurationSeconds = (Date.now() - pauseStartTime) / 1000;

            // Log the user's answer to the reasoning log file
            const timestamp = new Date().toISOString().replace('T', ' ').slice(0, -5);
            fs.appendFileSync(reasoningLogFile, `[${timestamp}] [USER_INPUT] User answered: "${answer}"\n\n`);

            // 3. RESUME: Update task, step, AND sequence status, moving question to history and tracking pause time
            updateStatus(statusFile, s => {
              s.interactionHistory.push({
                question: error.question,
                answer,
                timestamp: new Date().toISOString()
              });
              s.pendingQuestion = undefined;
              s.phase = 'running';
              s.steps[name] = 'running'; // Set the step back to running
              if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0 };
              s.stats.totalPauseTime += pauseDurationSeconds;
            });

            if (sequenceStatusFile) {
              try {
                updateSequenceStatus(sequenceStatusFile, s => {
                  s.phase = 'running';
                  if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0, totalTokenUsage: {} };
                  s.stats.totalPauseTime += pauseDurationSeconds;
                });
              } catch (seqError) {
                console.log(pc.yellow(`[Orchestrator] Warning: Could not update sequence status on resume: ${seqError}`));
              }
            }

            // 4. Prepare feedback for the next loop iteration
            feedbackForNextRun = `You previously asked: "${error.question}". The user responded: "${answer}". Continue your work based on this answer.`;
          } catch (inputError) {
            if (inputError instanceof InterruptedError) {
              // User hit Ctrl+C during input - maintain waiting_for_input state
              throw inputError;
            }
            throw inputError;
          }
        } else {
          // It's a real error, re-throw it
          throw error;
        }
      }
    }

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

          // Set feedbackForNextRun for rate limit resumption
          feedbackForNextRun = `You are resuming an automated task that was interrupted by an API usage limit. Your progress up to the point of interruption has been saved. Your goal is to review your previous actions and continue the task from where you left off.`;
          attempt--; // Decrement attempt to retry this same step
          continue; // Continue to the next iteration of the for loop
        }
      } else {
        updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
        throw new Error(`Workflow failed: Claude AI usage limit reached. Your limit will reset at ${resetTime.toLocaleString()}.\nTo automatically wait and resume, set 'waitForRateLimitReset: true' in your cat-herder.config.js.\nYou can re-run the command after the reset time to continue from this step.`);
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

    // Set feedbackForNextRun for check failure retry
    feedbackForNextRun = `Your previous attempt to complete the '${name}' step failed its validation check.\n\nHere are the original instructions you were given for this step:
--- ORIGINAL INSTRUCTIONS ---\n${fullPrompt}\n--- END ORIGINAL INSTRUCTIONS ---\n\n${checkDescription} failed with the following error output:
--- ERROR OUTPUT ---\n${checkResult.output || 'No output captured'}\n--- END ERROR OUTPUT ---\n\nPlease re-attempt the task. Your goal is to satisfy the **original instructions** while also fixing the error reported above. Analyze both the original goal and the specific failure. Do not modify the tests or checks.`;
    continue; // The for loop will continue to the next attempt with this feedback.
  }
}