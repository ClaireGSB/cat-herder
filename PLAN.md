Of course. Here is a comprehensive `PLAN.md` that breaks down the project into clear, actionable steps suitable for a junior developer.

***

# PLAN.md

## Title: Implement Configurable, Step-Specific Pipeline Hooks

**Goal:** To empower users to define step-specific hooks directly in `claude.config.js`, enabling more resilient and self-correcting automated workflows.

### Description

Currently, the pipeline is rigid. When a step's `check` fails (e.g., `npm test`), the entire workflow halts, requiring manual intervention. There is no built-in mechanism to allow a step to automatically retry with feedback.

This change introduces a `hooks` object that can be added to any pipeline step in `claude.config.js`. This allows for a `preCheck` validation and, more importantly, an `onCheckFailure` hook that triggers a retry loop. If a check fails, the hook generates a new prompt (including the error output) and sends it back to Claude, giving the AI a chance to fix its own work.

### Summary Checklist

-   [x] **1. Update Configuration Types:** Add the new `hooks` structure to the `PipelineStep` interface in `src/config.ts`.
-   [x] **2. Modify the Check Runner:** Update `runCheck` to return a detailed result object instead of throwing an error on failure.
-   [x] **3. Implement Orchestrator Retry Logic:** Refactor `executeStep` in `src/tools/orchestrator.ts` to manage a retry loop and execute the new hooks.
-   [ ] **4. Update Example Configuration:** Add a sample `onCheckFailure` hook to the default template in `src/templates/claude.config.js`.
-   [ ] **5. Add Unit Tests:** Create a new test file to verify the orchestrator's retry and hook-triggering behavior.
-   [ ] **6. Update Project Documentation:** Revise `README.md` to explain the new `hooks` feature with a clear example.

---

### Detailed Implementation Steps

#### 1. Update Configuration Types

*   **Objective:** Define the data structures for the new `hooks` feature so that TypeScript can validate our configuration.
*   **Task:**
    1.  Navigate to `src/config.ts`.
    2.  Define a new `HookConfig` interface.
    3.  Add an optional `hooks` property to the `PipelineStep` interface, which will contain optional `preCheck` and `onCheckFailure` arrays.
*   **Code Snippet (`src/config.ts`):**
    ```typescript
    // Add this new interface
    export interface HookConfig {
      type: 'shell';
      command: string;
    }

    // Modify the existing PipelineStep interface
    export interface PipelineStep {
      name: string;
      command: string;
      check: CheckConfig;
      fileAccess?: {
        allowWrite?: string[];
      };
      // Add this new optional property
      hooks?: {
        preCheck?: HookConfig[];
        onCheckFailure?: HookConfig[];
      };
    }
    ```

#### 2. Modify the Check Runner

*   **Objective:** Change `runCheck` to return the specific error output from a failed check, which the orchestrator can then pass to a hook.
*   **Task:**
    1.  Navigate to `src/tools/check-runner.ts`.
    2.  Modify the `runCheck` function to be `async` and return a `Promise<CheckResult>` object (`{ success: boolean; output?: string; }`) instead of `void`.
    3.  In the `shell` check's `catch` block, instead of re-throwing the error, `return { success: false, output: error.stderr.toString() }`.
*   **Code Snippet (`src/tools/check-runner.ts`):**
    ```typescript
    // Define the new return type
    export interface CheckResult {
      success: boolean;
      output?: string;
    }

    // Update the function signature
    export async function runCheck(checkConfig: CheckConfig, projectRoot: string): Promise<CheckResult> {
      // ...
      case "shell":
        // ...
        try {
          execSync(checkConfig.command, { stdio: "pipe", cwd: projectRoot });
          if (expect === "fail") { /* ... */ return { success: false, output: "..." }; }
          return { success: true };
        } catch (error: any) {
          if (expect === "pass") {
            console.error(pc.red(`  ✖ Check failed...`));
            // This is the key change: return the failure details
            return { success: false, output: error.stderr?.toString() || error.message };
          }
          return { success: true };
        }
    }
    ```

#### 3. Implement Orchestrator Retry Logic

*   **Objective:** Rewrite the core step execution logic to handle retries, `preCheck` hooks, and `onCheckFailure` feedback loops.
*   **Task:**
    1.  Navigate to `src/tools/orchestrator.ts`.
    2.  Refactor the `executeStep` function. It should now accept the entire `stepConfig` object.
    3.  Wrap the logic in a `for` loop to handle a maximum of 3 retries.
    4.  After the main Claude command runs, execute any `preCheck` hooks.
    5.  Call the updated `runCheck` and inspect the `CheckResult`.
    6.  If the check fails, execute the `onCheckFailure` hook command, substitute `{check_output}` with the error from `runCheck`, and set the result as the `currentPrompt` for the next loop iteration.
    7.  Update the main `runTask` function to pass the full `stepConfig` object to `executeStep`.
*   **Code Snippet (Conceptual - `src/tools/orchestrator.ts`):**
    ```typescript
    async function executeStep(stepConfig: PipelineStep, /*...other args...*/) {
      const { name, command, check, hooks } = stepConfig;
      let currentPrompt = /* initial prompt */;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Run main Claude command with currentPrompt...

        // Run preCheck hooks...

        const checkResult = await runCheck(check, projectRoot);

        if (checkResult.success) {
          // Commit and return successfully
          return;
        }

        // --- Failure Case ---
        if (!hooks?.onCheckFailure || attempt === maxRetries) {
          throw new Error(`Step "${name}" failed its check.`);
        }

        const feedbackCommand = hooks.onCheckFailure[0].command; // Simplified for example
        const feedbackTemplate = execSync(feedbackCommand, { encoding: 'utf-8' });
        currentPrompt = feedbackTemplate.replace(/{check_output}/g, checkResult.output || '');
      }
    }
    ```

#### 4. Update Example Configuration

*   **Objective:** Provide a working example of the new feature in the default configuration file that `claude-project init` creates.
*   **Task:**
    1.  Navigate to `src/templates/claude.config.js`.
    2.  Locate the `implement` step within the `default` pipeline.
    3.  Add a `hooks` object with an `onCheckFailure` hook that provides a feedback prompt.
*   **Code Snippet (`src/templates/claude.config.js`):**
    ```javascript
    // In the 'implement' step object:
    {
      name: "implement",
      command: "implement",
      check: { type: "shell", command: "npm test", expect: "pass" },
      fileAccess: { allowWrite: ["src/**/*"] },
      // Add this entire block
      hooks: {
        onCheckFailure: [
          {
            type: "shell",
            command: "echo 'The test suite failed. The errors are provided below. Please analyze the output, fix the code in the src/ directory, and ensure all tests pass. Do not modify the test files themselves.\n\n---\n\n{check_output}'"
          }
        ]
      }
    },
    ```

#### 5. Add Unit Tests

*   **Objective:** Verify that the orchestrator correctly handles the hook and retry logic in isolation.
*   **Task:**
    1.  Create a new test file: `test/orchestrator-hooks.test.ts`.
    2.  Use `vi.mock` to mock `execSync` and `runCheck`.
    3.  Write a test case: "should trigger onCheckFailure hook and retry if the check fails".
    4.  In the test, make the mocked `runCheck` return `{ success: false, output: 'Test failed!' }` on its first call, and `{ success: true }` on its second.
    5.  Assert that `execSync` was called with the feedback command from the `onCheckFailure` hook.
    6.  Assert that the step ultimately succeeds.

#### 6. Update Project Documentation

*   **Objective:** Explain the powerful new `hooks` feature to users in the main `README.md`.
*   **Task:**
    1.  Navigate to `README.md`.
    2.  Create a new H3 section under "How It Works" titled `### Advanced: Step Hooks and Self-Correction`.
    3.  Explain the purpose of the `hooks` object and its two properties: `preCheck` and `onCheckFailure`.
    4.  Provide the `implement` step from the config as a clear code example.
    5.  Explicitly describe the `{check_output}` token and how it allows passing context from a failed check back to Claude.

### Error Handling & Warnings

*   **`preCheck` Failure:** If any command in the `preCheck` array fails (exits with a non-zero code), the entire step should fail immediately. The orchestrator should log a clear error: `Pre-check hook "${hook.command}" failed for step "${name}".`
*   **`onCheckFailure` Hook Failure:** If the command inside an `onCheckFailure` hook fails, it's a configuration error. The retry loop should be terminated, and the step should fail with a message like: `The onCheckFailure hook "${hook.command}" failed to execute. Cannot generate feedback for Claude.`
*   **Infinite Loop:** The retry mechanism must have a hard limit (e.g., 3 attempts). If the step still fails after the last attempt, the orchestrator must throw a fatal error, clearly stating that the retry limit was reached.
*   **Missing `{check_output}`:** If the user's `onCheckFailure` command does not include the `{check_output}` token, the feature should still work gracefully. No replacement will occur, but the command will still execute. No warning is necessary.