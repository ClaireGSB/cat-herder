

# PLAN: Enhance AI Interaction Logging and Contextual Resumption

## Title & Goal

**Title:** Improve AI Interactive Halting by Logging User Answers and Providing Full Reasoning History

**Goal:** To enhance the AI's interactive halting (ask human) feature by explicitly logging user answers in the reasoning log and ensuring the AI receives its complete previous reasoning history upon resuming a paused task, leading to better context and more effective task completion.

## Description

This project addresses two key areas of improvement for the `@your-scope/cat-herder` tool's interactive halting feature. Currently, when the AI pauses to ask a user a question, the user's response is recorded in the task's state file but is not explicitly written into the AI's `reasoning.log` file. This creates a gap in the detailed interaction history, making it harder to debug the AI's thought process.

Furthermore, when the AI resumes a task after human intervention, an API rate limit pause, or a check failure retry, the prompt it receives does not include its own step-by-step reasoning that occurred *before* the pause. This lack of historical context can lead to redundant thinking or less informed decisions as the AI attempts to continue the task.

The new behavior will ensure that every user answer is clearly appended to the `reasoning.log`, providing a complete transcript of the human-AI dialogue. Additionally, the prompt construction logic will be refactored to consistently feed the AI its original step instructions, a filtered log of its preceding actions within that step, and any specific feedback (user answer, rate limit message, or check failure details) when resuming. This will provide the AI with a richer, more accurate context, enabling it to pick up where it left off more intelligently.

## Summary Checklist

- [ ] Implement explicit logging of user answers in the AI's reasoning log file.
- [ ] Refactor the step execution prompt construction to include the AI's previous reasoning history and specific feedback (user answer, rate limit, check failure) when resuming.
- [ ] Update `README.md` to reflect enhanced logging and contextual resumption.
- [ ] Update `ARCHITECTURE.MD` to describe the improved interaction flow and reasoning context.

## Detailed Implementation Steps

### 1. Implement explicit logging of user answers in the AI's reasoning log file.

-   **Objective:** To ensure that the human's response to an AI's clarifying question is permanently recorded within the `reasoningLogFile`.
-   **Task:** Modify the `src/tools/orchestration/step-runner.ts` file.
    -   Ensure `import fs from "node:fs";` is at the top of the file.
    -   Locate the `catch (error instanceof HumanInterventionRequiredError)` block within the `executeStep` function.
    -   After `const answer = await waitForHumanInput(error.question, stateDir, taskId);` is called and returns the user's answer, add a line to append this answer to the `reasoningLogFile`.
-   **Code Snippet (src/tools/orchestration/step-runner.ts - within `catch (HumanInterventionRequiredError)` block):**

    ```typescript
    // ... (previous code in the catch block)

    // 2. PROMPT: Ask the user the question in CLI or web UI
    const stateDir = path.dirname(statusFile);
    const pauseStartTime = Date.now();
    const answer = await waitForHumanInput(error.question, stateDir, taskId);
    const pauseDurationSeconds = (Date.now() - pauseStartTime) / 1000;

    // PROBLEM 1 FIX: Log the user's answer to the reasoning log file
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, -5);
    fs.appendFileSync(reasoningLogFile, `[${timestamp}] [USER_INPUT] User answered: "${answer}"\n\n`);

    // ... (rest of the code in the catch block)
    ```

### 2. Refactor the step execution prompt construction to include the AI's previous reasoning history and specific feedback.

-   **Objective:** To provide the AI with a comprehensive, context-rich prompt upon resuming any paused step, including its prior reasoning and the specific reason for resumption (user answer, rate limit, check failure).
-   **Task:** Modify the `src/tools/orchestration/step-runner.ts` file.
    -   Introduce a new variable `feedbackForNextRun: string | null = null;` at the beginning of the `executeStep` function to manage feedback consistently.
    -   Within the `while (needsResume)` loop, before `runStreaming` is called:
        -   Implement logic to read the `reasoningLogFile`, parse its content, and extract the AI's raw reasoning steps while filtering out internal headers, footers, and debug messages added by `proc.ts`. Store this in a `previousReasoningForPrompt` string.
        -   Construct the `promptToUse` by assembling an array of `promptParts`: the `fullPrompt` (original step instructions), the `previousReasoningForPrompt` (if available), and the `feedbackForNextRun` (if set).
        -   Set `feedbackForNextRun = null;` after it has been used to prevent it from being included in subsequent runs within the same `needsResume` loop iteration.
    -   Update the existing `HumanInterventionRequiredError` catch block, the `result.rateLimit` handling, and the check failure handling (both `result.code !== 0` and `!checkResult.success`) to set the `feedbackForNextRun` variable instead of directly modifying `currentPrompt`.
-   **Code Snippet (src/tools/orchestration/step-runner.ts - main loop structure within `executeStep`):**

    ```typescript
    // src/tools/orchestration/step-runner.ts
    // ... (existing imports and definitions)

    export async function executeStep(
      stepConfig: PipelineStep,
      fullPrompt: string, // This is the original, unadulterated prompt for the step.
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

      // This will hold feedback for the *next* runStreaming call within the `while` loop.
      let feedbackForNextRun: string | null = null;

      console.log(pc.cyan(`\n[Orchestrator] Starting step: ${name}`));

      const status = readStatus(statusFile);

      if (status.steps[name] === 'interrupted') {
        console.log(pc.yellow(`[Orchestrator] Resuming interrupted step: "${name}"`));
        // If resuming from an interrupted state, and there's a pending question,
        // the human interaction flow will handle setting feedbackForNextRun.
        // Otherwise, it starts with the base prompt.
      }

      updateStatus(statusFile, s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        if (attempt > 1) {
          console.log(pc.yellow(`\n[Orchestrator] Retry attempt ${attempt}/${maxRetries} for step: ${name}`));
        }

        const taskId = path.basename(statusFile, '.state.json');
        const sequenceId = sequenceStatusFile ? path.basename(sequenceStatusFile, '.state.json') : undefined;

        let needsResume = true;
        let result: any;
        let partialTokenUsage: any;
        let modelName: string;

        while (needsResume) {
          // --- START PROMPT CONSTRUCTION FOR THIS runStreaming CALL ---
          let previousReasoningForPrompt = '';
          if (fs.existsSync(reasoningLogFile)) {
            const fullLogContent = fs.readFileSync(reasoningLogFile, 'utf-8');
            const logLines = fullLogContent.split('\n');
            let filteredLines: string[] = [];
            let inReasoningSection = false;

            // Iterate in reverse to find the latest actual reasoning section
            // Filters out headers, footers, and internal debug lines
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
              if (line.includes('--- This file contains Claude\'s step-by-step reasoning process ---')) {
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

          try {
            // ... (runStreaming call with promptToUse)
            const stateDir = path.dirname(statusFile);
            const runningPromise = runStreaming("claude", [`/project:${command}`], logFile, reasoningLogFile, projectRoot, promptToUse, rawJsonLogFile, model, { pipelineName, settings: config }, taskId);

            let pollInterval: NodeJS.Timeout | null = null;

            const statePollingPromise = new Promise<never>((resolve, reject) => {
              pollInterval = setInterval(() => {
                const currentStatus = readStatus(statusFile);
                if (currentStatus.phase === 'waiting_for_input' && currentStatus.pendingQuestion) {
                  clearInterval(pollInterval!);
                  killActiveProcess();
                  reject(new HumanInterventionRequiredError(currentStatus.pendingQuestion.question));
                }
              }, 500);
            });

            try {
              result = await Promise.race([runningPromise, statePollingPromise]);
            } finally {
              if (pollInterval) {
                clearInterval(pollInterval);
              }
            }
            partialTokenUsage = result.tokenUsage;
            modelName = result.modelUsed || model || 'default';
            needsResume = false; // If it finishes without error, exit loop
            feedbackForNextRun = null; // Clear feedback if step completes successfully
          } catch (error) {
            if (error instanceof HumanInterventionRequiredError) {
              // ... (existing pause, prompt, resume logic)

              // PROBLEM 2 FIX: Prepare feedback for the NEXT loop iteration with human answer
              feedbackForNextRun = `You previously asked: "${error.question}". The user responded: "${answer}". Continue your work based on this answer.`;
            } else {
              // It's a real error (e.g., rate limit), re-throw it after setting feedback
              if (error.rateLimit) {
                feedbackForNextRun = `You are resuming an automated task that was interrupted by an API usage limit. Your progress up to the point of interruption has been saved. Your goal is to review your previous actions and continue the task from where you left off.`;
              }
              throw error; // Re-throw any other non-human-intervention error
            }
          }
        } // End while (needsResume) loop

        // ... (existing status update and interruption handling)

        // Handle rate limit *after* token usage aggregation, if the error wasn't caught in the inner while loop.
        // This block is primarily for `runStreaming` errors that directly return rateLimit.
        if (result.rateLimit) {
          // ... (existing rate limit wait logic)

          // PROBLEM 2 FIX: Set feedbackForNextRun for rate limit resumption
          feedbackForNextRun = `You are resuming an automated task that was interrupted by an API usage limit. Your progress up to the point of interruption has been saved. Your goal is to review your previous actions and continue the task from where you left off.`;
          attempt--; // Decrement attempt to retry this same step
          continue; // Continue to the next iteration of the for loop
        }

        if (result.code !== 0) {
          // ... (existing error handling and max retries check)

          // PROBLEM 2 FIX: Set feedbackForNextRun for check failure retry
          const checkDescription = Array.isArray(check)
            ? 'One of the validation checks'
            : `The validation check`;
          feedbackForNextRun = `Your previous attempt to complete the '${name}' step failed its validation check.\n\nHere are the original instructions you were given for this step:
--- ORIGINAL INSTRUCTIONS ---\n${fullPrompt}\n--- END ORIGINAL INSTRUCTIONS ---\n\n${checkDescription} failed with the following error output:
--- ERROR OUTPUT ---\n${result.output || 'No output captured'}\n--- END ERROR OUTPUT ---\n\nPlease re-attempt the task. Your goal is to satisfy the **original instructions** while also fixing the error reported above. Analyze both the original goal and the specific failure. Do not modify the tests or checks.`;
          continue; // The for loop will continue to the next attempt with this feedback.
        }

        // If check failed *after* the Claude process exited successfully (should ideally be caught by result.code !== 0)
        const checkResult = await runCheck(check, projectRoot);
        if (!checkResult.success) {
          // ... (existing error handling and max retries check)

          const checkDescription = Array.isArray(check)
            ? 'One of the validation checks'
            : `The validation check`;
          feedbackForNextRun = `Your previous attempt to complete the '${name}' step failed its post-execution validation check.\n\nHere are the original instructions you were given for this step:
--- ORIGINAL INSTRUCTIONS ---\n${fullPrompt}\n--- END ORIGINAL INSTRUCTIONS ---\n\n${checkDescription} failed with the following error output:
--- ERROR OUTPUT ---\n${checkResult.output || 'No output captured'}\n--- END ERROR OUTPUT ---\n\nPlease re-attempt the task. Your goal is to satisfy the **original instructions** while also fixing the error reported above. Analyze both the original goal and the specific failure. Do not modify the tests or checks.`;
          continue;
        }

        // ... (rest of the successful step logic)
        updateStatus(statusFile, s => { s.phase = "pending"; s.steps[name] = "done"; });
        feedbackForNextRun = null; // Clear feedback if step is done.
        return;
      }
    }
    ```

### 3. Update documentation (`README.md` and `ARCHITECTURE.MD`).

-   **Objective:** To accurately reflect the new logging behavior and improved contextual resumption for the AI in the project's user and developer documentation.
-   **Task:**
    -   **`README.md`:**
        -   In the "Interactive Halting (Interaction Threshold)" section, update the description for point 3 ("Run the Task") to mention that all interactions (questions and answers) are saved and can be reviewed in the task detail page and in the reasoning log.
        -   In the "Debugging and Logs" section, update the description for `XX-step-name.reasoning.log` to explicitly state that it now includes the AI's detailed thinking process *and* any user answers provided during interactive halting.
    -   **`ARCHITECTURE.MD`:**
        -   In section "2. Core Architectural Concepts" -> "3. AI Interaction Layer (`src/tools/proc.ts`)", clarify that after `askHuman` is invoked and the human provides input, the Orchestration Layer logs this input to the reasoning file and feeds it back to the AI.
        -   In section "2. Core Architectural Concepts" -> "4. State Layer (`src/tools/status.ts`)", ensure it's clear that `interactionHistory` tracks all Q&A exchanges.
        -   In section "6. Guiding Principles for Future Development", consider adding or enhancing a principle around "Comprehensive Context for AI Resumption" to reinforce the importance of this feature.
-   **Code Snippet (Example `README.md` update):**

    ```markdown
    # README.md

    ## Interactive Halting (Interaction Threshold)

    ...

    3.  **Run the Task:** When the AI needs to ask a question, it will pause... The specific pipeline step, the task, and if applicable, the parent sequence are all set to a `waiting_for_input` status in the UI, providing consistent status visibility across all workflow levels. You can answer in two ways:
        *   **Via CLI:** The command line will display the question and wait for your typed response.
        *   **Via Web Dashboard:** The dashboard will show an interactive card with the question and a form to submit your answer.
    4.  **Resume:** Once an answer is provided from either source, the AI receives the guidance and continues the task. All interactions are saved and can be reviewed on the task detail page in the web dashboard **and are explicitly logged in the reasoning log file for that step.**

    ## Debugging and Logs

    The orchestrator provides comprehensive logging to help you understand both what happened and why. For each pipeline step, three log files are created in the `~/.cat-herder/logs/` directory:

    -   **`XX-step-name.log`**: ...
    -   **`XX-step-name.reasoning.log`**: Contains the AI's detailed reasoning process. This shows the step-by-step thinking that led to the final output, **including user answers provided during interactive sessions.** This log file now includes a header with the pipeline name, model, and settings used for the step, as well as start and end timestamps.
    -   **`XX-step-name.raw.json.log`**: ...
    ```

## Error Handling & Warnings

-   **User Interruption During Input (Ctrl+C):** If a user presses `Ctrl+C` while the CLI is waiting for their answer to an AI question, the `waitForHumanInput` function will catch this, throw an `InterruptedError`, and the task will remain in the `waiting_for_input` state. The CLI will log a message indicating that input was interrupted and the task is paused. This allows the user to later provide the answer via the web dashboard or resume the task.
-   **Malformed Reasoning Log File:** The logic to extract `previousReasoningForPrompt` from `reasoningLogFile` includes robust filtering. In cases of a severely malformed, empty, or non-existent `reasoningLogFile`, `previousReasoningForPrompt` will simply be an empty string. This gracefully handles edge cases by providing a simpler prompt to the AI without prior reasoning, rather than crashing the process.
-   **Consistency of Prompts:** The refactoring ensures a consistent structure for all resumption prompts (human answer, rate limit, check failure), which reduces the chance of the AI misinterpreting its context.
-   **No Impact on Non-Interactive Flows:** These changes specifically target scenarios where the AI needs to resume or receive feedback. Fully autonomous runs (where `interactionThreshold` is 0 and no checks fail) will proceed as before, benefiting from cleaner code but without altering their core execution path.

---