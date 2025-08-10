# PLAN.md

## Title & Goal

**Title:** Graceful Handling and Auto-Resume for Claude API Usage Limits

**Goal:** Implement a feature to intelligently handle Claude API usage limit errors by either pausing and automatically resuming the workflow or failing gracefully in a way that allows for easy manual continuation.

## Description

Currently, when the Claude API usage limit is reached, the tool receives a specific JSON error but treats it as a generic failure. This causes the workflow to halt abruptly with an unhelpful error message, forcing the user to manually restart the entire process later.

This change introduces a more resilient approach. It will parse the rate limit error to identify the exact reset time. Based on a new configuration option, the tool will either:
1.  **Wait & Resume (Opt-in):** Pause execution and automatically restart the failed step once the usage limit has been reset.
2.  **Graceful Fail & Resume (Default):** Terminate the process with a clear, informative message explaining when the user can resume. The task's state is preserved, allowing the user to re-run the command and pick up exactly where they left off.

## Summary Checklist

- [ ] **Config:** Add a `waitForRateLimitReset` option to `claude.config.js` and the config type definitions.
- [ ] **Proc:** Update the process runner (`proc.ts`) to specifically detect and parse the rate limit error message.
- [ ] **Status:** Add a new `waiting_for_reset` phase to the task status model.
- [ ] **Orchestrator:** Implement the core logic in `orchestrator.ts` to handle the parsed error, deciding whether to wait or fail based on the user's config.
- [ ] **Tests:** Create new integration tests to verify both the "wait" and "graceful fail" scenarios.
- [ ] **Documentation:** Update `README.md` to explain the new feature to users.

## Detailed Implementation Steps

### 1. Update Configuration

*   **Objective:** Introduce a new configuration setting that allows users to opt into the auto-resume behavior.
*   **Tasks:**
    1.  Modify the `ClaudeProjectConfig` interface in `src/config.ts`.
    2.  Update the default configuration object.
    3.  Add the new setting to the template file `src/templates/claude.config.js` with explanatory comments.

*   **Code Snippets:**

    **File:** `src/config.ts`
    ```typescript
    // Before:
    export interface ClaudeProjectConfig {
      // ... existing properties
      defaultPipeline?: string;
      pipeline?: PipelineStep[];
    }
    
    // After:
    export interface ClaudeProjectConfig {
      // ... existing properties
      manageGitBranch?: boolean;
      waitForRateLimitReset?: boolean; // Add this line
      pipelines?: PipelinesMap;
      defaultPipeline?: string;
    }
    ```

    **File:** `src/templates/claude.config.js`
    ```javascript
    // Add this new section with comments
    module.exports = {
      //...
      manageGitBranch: true,
    
      /**
       * If true, the orchestrator will pause and wait when it hits the Claude
       * API usage limit, then automatically resume when the limit resets.
       * If false (default), it will fail gracefully with a message.
       */
      waitForRateLimitReset: false,
    
      defaultPipeline: 'default',
      //...
    };
    ```

### 2. Detect Rate Limit Error in Process Runner

*   **Objective:** Enhance the `runStreaming` function to recognize the specific "usage limit reached" error from Claude's output and return a structured result.
*   **Tasks:**
    1.  Modify the return type of `runStreaming` in `src/tools/proc.ts` to include optional rate limit details.
    2.  Inside the `stdout.on('data')` handler, parse the JSON output and check for the specific error string.
    3.  If the error is found, extract the timestamp and store it.
    4.  When the process closes, resolve the promise with the structured error data.

*   **Code Snippets:**

    **File:** `src/tools/proc.ts`
    ```typescript
    // Define a new, more descriptive return type
    export interface StreamResult {
        code: number;
        output: string;
        rateLimit?: {
            resetTimestamp: number;
        };
    }

    // Update the function signature
    export function runStreaming(
      //...
    ): Promise<StreamResult> { // Changed return type
        // ...
        let rateLimitInfo: StreamResult['rateLimit'] | undefined;

        // Inside the promise
        p.stdout.on("data", (chunk) => {
            //... inside the line processing loop
            try {
                const json = JSON.parse(line);

                if (json.type === "result" && typeof json.result === 'string' && json.result.startsWith("Claude AI usage limit reached|")) {
                    const parts = json.result.split('|');
                    const timestamp = parseInt(parts[1], 10);
                    if (!isNaN(timestamp)) {
                        rateLimitInfo = { resetTimestamp: timestamp };
                    }
                }
                
                // ... rest of the stdout handler
            } catch (e) {
                // ...
            }
        });
        
        // ...
        p.on("close", (code) => {
            //...
            // Resolve with the structured data
            resolve({ code: code ?? 1, output: fullOutput, rateLimit: rateLimitInfo });
        });
    }
    ```

### 3. Add New "Waiting" Task Status

*   **Objective:** Create a new status phase to accurately reflect when the tool is paused and waiting for an API limit reset.
*   **Tasks:**
    1.  Edit the `Phase` type in `src/tools/status.ts`.

*   **Code Snippet:**

    **File:** `src/tools/status.ts`
    ```typescript
    // Before:
    export type Phase = "pending" | "running" | "done" | "failed" | "interrupted";

    // After:
    export type Phase = "pending" | "running" | "done" | "failed" | "interrupted" | "waiting_for_reset";
    ```

### 4. Implement Core Orchestrator Logic

*   **Objective:** Modify the `executeStep` function in the orchestrator to handle the new `rateLimit` error from `runStreaming`.
*   **Tasks:**
    1.  In `src/tools/orchestrator.ts`, check the result of the `runStreaming` call for the `rateLimit` property.
    2.  If the error is present, check the `waitForRateLimitReset` config value.
    3.  **Wait Logic:** If `true`, calculate the wait time, log a message, update the task status to `waiting_for_reset`, and use a `setTimeout` promise to pause execution. After the wait, loop back to retry the step without consuming a retry attempt.
    4.  **Graceful Fail Logic:** If `false`, throw a new, more informative error that includes the human-readable reset time and instructions on how to resume.

*   **Code Snippet:**

    **File:** `src/tools/orchestrator.ts` (inside `executeStep`)
    ```typescript
    // Replace the simple check for `code !== 0` with more detailed logic.
    const result = await runStreaming(/*...args...*/);

    // Check for rate limit error FIRST
    if (result.rateLimit) {
        const config = await getConfig();
        const resetTime = new Date(result.rateLimit.resetTimestamp * 1000);

        if (config.waitForRateLimitReset) {
            const waitMs = resetTime.getTime() - Date.now();
            if (waitMs > 0) {
                console.log(pc.yellow(`[Orchestrator] Claude API usage limit reached.`));
                console.log(pc.cyan(`  › Pausing and will auto-resume at ${resetTime.toLocaleTimeString()}.`));
                updateStatus(statusFile, s => {
                    s.phase = "waiting_for_reset";
                    s.steps[name] = "running"; // Keep the step as running
                });

                // This makes the process wait without blocking the event loop
                await new Promise(resolve => setTimeout(resolve, waitMs));

                console.log(pc.green(`[Orchestrator] Resuming step: ${name}`));
                updateStatus(statusFile, s => { s.phase = "running"; });
                // By continuing the loop, we re-run the same step.
                // We decrement `attempt` so this doesn't count as a "retry".
                attempt--; 
                continue; // Skip the rest of the loop and try the step again
            }
        } else {
            // Graceful failure
            updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
            throw new Error(`Claude AI usage limit reached. Your limit will reset at ${resetTime.toLocaleTimeString()}.
To automatically wait and resume, set 'waitForRateLimitReset: true' in your claude.config.js.
You can re-run the command after the reset time to continue from this step.`);
        }
    }
    
    // Original failure check
    if (result.code !== 0) {
      updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
      throw new Error(`Step "${name}" failed. Check the output log for details: ${logFile}`);
    }
    // ... rest of the function (check logic, commit, etc.)
    ```

### 5. Add Tests

*   **Objective:** Ensure both the "wait" and "graceful fail" behaviors work as expected.
*   **Tasks:**
    1.  Create a new test file, `test/orchestrator-ratelimit.test.ts`.
    2.  Use `vi.mock` to mock `src/tools/proc.ts`.
    3.  **Test Case 1 (Wait & Resume):**
        *   Set config `waitForRateLimitReset` to `true`.
        *   Mock `runStreaming` to return the rate limit error on its first call, and a success result on its second.
        *   Use `vi.useFakeTimers()` to control `setTimeout`.
        *   Assert that the correct "waiting" log is produced and that after advancing timers, the step completes successfully.
    4.  **Test Case 2 (Graceful Fail):**
        *   Set config `waitForRateLimitReset` to `false`.
        *   Mock `runStreaming` to return the rate limit error.
        *   Assert that `runTask` throws an error and that the error message contains the expected human-readable text.

### 6. Update Documentation

*   **Objective:** Clearly document the new feature for all users.
*   **Task:** Add a new section to `README.md`.

*   **Code Snippet:**

    **File:** `README.md` (add a new section)
    ```markdown
    ### Handling API Rate Limits

    The orchestrator is designed to be resilient against Claude API usage limits. When a rate limit is hit, the tool detects it and handles it in one of two ways.

    #### Graceful Failure (Default)

    By default, if the API limit is reached, the workflow will stop and display a message like this:

    ```
    Workflow failed: Claude AI usage limit reached. Your limit will reset at 1:00:00 PM.
    To automatically wait and resume, set 'waitForRateLimitReset: true' in your claude.config.js.
    You can re-run the command after the reset time to continue from this step.
    ```
    
    Your progress is saved. Once your limit resets, simply run the exact same `claude-project run` command again, and the orchestrator will pick up right where it left off.

    #### Automatic Wait & Resume (Opt-in)

    For a fully autonomous workflow, you can enable the auto-resume feature. In your `claude.config.js`, set:

    ```javascript
    module.exports = {
      // ...
      waitForRateLimitReset: true,
      // ...
    };
    ```

    With this setting, instead of failing, the tool will pause execution and log a waiting message. It will automatically resume the task as soon as the API usage limit has reset.
    ```

## Error Handling & Warnings

*   **Invalid Timestamp:** If the timestamp received from the Claude tool is malformed or non-numeric, the `parseInt` will result in `NaN`. The logic should treat this as a generic failure and not attempt to wait.
*   **Long Wait Times:** If the calculated wait duration is excessively long (e.g., more than 8 hours), log a clear warning to the console so the user is aware of the extended pause.
    *   Example: `[Orchestrator] WARNING: API reset is scheduled for tomorrow at 1:00 PM. The process will pause for over 8 hours. You can safely terminate with Ctrl+C and restart manually after the reset time.`
*   **User Interruption:** If the user presses `Ctrl+C` while the process is waiting, the process should terminate cleanly. No special signal handling is required for the initial implementation. The task status will remain as `waiting_for_reset`, and on the next run, it will resume the step.