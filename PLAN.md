

# PLAN.md

## Title: Refactor Pipeline Hooks to a Simpler `retry` Configuration

**Goal:** To replace the verbose `hooks` object with a simple `retry: number` property in the step configuration, making the self-correction feature more intuitive and easier to use.

### Description

The current `onCheckFailure` hook is powerful but requires users to write a shell command and understand a special `{check_output}` token. This is often more configuration than needed for the common goal of "retrying a step with the failure reason."

This refactor simplifies this entire feature. We will remove the `hooks` object and replace it with a single, optional `retry` property. If a step's check fails and `retry: 3` is set, the orchestrator will now *automatically* generate a generic but effective feedback prompt and trigger the retry loop.

**Before:**
```javascript
hooks: {
  onCheckFailure: [{ type: "shell", command: "echo 'Tests failed... {check_output}'" }]
}```

**After:**
```javascript
retry: 3
```

This change significantly improves user experience by hiding implementation details and focusing the configuration on the user's intent: "How many times should this step retry on failure?"

### Summary Checklist

-   [x] **1. Update Configuration Types:** Replace the `hooks` object with a `retry?: number` property in the `PipelineStep` interface.
-   [x] **2. Refactor Orchestrator Logic:** Modify `executeStep` to use the `retry` property and auto-generate the feedback prompt.
-   [ ] **3. Delete Obsolete Code:** Remove the `executeHooks` helper function, which is no longer needed.
-   [ ] **4. Update Example Configuration:** Revise the `claude.config.js` template to use the new `retry` property.
-   [ ] **5. Refactor Unit Tests:** Update tests to validate the new `retry` logic instead of the old `hooks` mechanism.
-   [ ] **6. Rewrite Documentation:** Overhaul the "Step Hooks" section in `README.md` to explain the new, simpler `retry` feature.

---

### Detailed Implementation Steps

#### 1. Update Configuration Types

*   **Objective:** Modify the core data structure in `src/config.ts` to reflect the new design.
*   **Task:**
    1.  Navigate to `src/config.ts`.
    2.  Delete the `HookConfig` interface, as it will no longer be used.
    3.  In the `PipelineStep` interface, remove the `hooks?: { ... };` property.
    4.  Add the new optional property: `retry?: number;`.
*   **Code Snippet (`src/config.ts`):**
    ```typescript
    // BEFORE
    export interface PipelineStep {
      // ...
      hooks?: { onCheckFailure?: HookConfig[] };
    }

    // AFTER
    export interface PipelineStep {
      // ...
      retry?: number;
    }
    ```

#### 2. Refactor Orchestrator Logic

*   **Objective:** Update the step execution loop to use the `retry` count and generate its own feedback prompt.
*   **Task:**
    1.  Navigate to `src/tools/orchestrator.ts`.
    2.  In the `executeStep` function, change the retry loop to be governed by `stepConfig.retry`. The `maxRetries` constant can be replaced by `stepConfig.retry ?? 0`.
    3.  Inside the failure case (after `checkResult.success` is false), replace the call to `executeHooks` with new logic to construct a generic prompt.
    4.  The new prompt should include the failed command from `check.command` and the error message from `checkResult.output`.
*   **Code Snippet (New logic in `src/tools/orchestrator.ts`):**
    ```typescript
    async function executeStep(stepConfig: PipelineStep, /* ... */) {
      const { name, command, check, retry } = stepConfig;
      const maxRetries = retry ?? 0;

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        // ... run Claude command ...
        const checkResult = await runCheck(check, projectRoot);

        if (checkResult.success) {
          // ... commit and return
          return;
        }

        // --- Failure Case ---
        if (attempt > maxRetries) {
          // If we've used all retries, fail permanently
          throw new Error(`Step "${name}" failed after ${maxRetries} retries.`);
        }
        
        // V-- THIS IS THE NEW CORE LOGIC --V
        console.log(pc.yellow(`[Orchestrator] Generating automatic feedback for step: ${name}`));
        const feedbackPrompt = `The previous attempt failed.
The validation check \`${check.command}\` failed with the following output:
---
${checkResult.output}
---
Please analyze this error, fix the underlying code, and try again. Do not modify the tests or checks.`;
        
        currentPrompt = feedbackPrompt; // Set prompt for the next loop iteration
        // ^-- END OF NEW CORE LOGIC --^
      }
    }
    ```

#### 3. Delete Obsolete Code

*   **Objective:** Remove dead code to keep the codebase clean.
*   **Task:**
    1.  Navigate to `src/tools/orchestrator.ts`.
    2.  Delete the entire `executeHooks` helper function, as it is no longer called from anywhere.

#### 4. Update Example Configuration

*   **Objective:** Update the default template to reflect the new, simpler configuration.
*   **Task:**
    1.  Navigate to `src/templates/claude.config.js`.
    2.  Find the `implement` step.
    3.  Remove the entire `hooks` object.
    4.  Add the `retry: 3` property.
*   **Code Snippet (`src/templates/claude.config.js`):**
    ```javascript
    // In the 'implement' step object:
    
    // BEFORE
    {
      name: "implement",
      // ...
      hooks: { onCheckFailure: [ /* ... */ ] }
    }

    // AFTER
    {
      name: "implement",
      command: "implement",
      check: { type: "shell", command: "npm test", expect: "pass" },
      fileAccess: { allowWrite: ["src/**/*"] },
      retry: 3
    }
    ```

#### 5. Refactor Unit Tests

*   **Objective:** Ensure the test suite validates the new `retry` behavior.
*   **Task:**
    1.  Navigate to `test/orchestrator-hooks.test.ts` and rename it to `test/orchestrator-retry.test.ts`.
    2.  Update the tests to pass a `retry: 3` property in the mock `stepConfig`.
    3.  Remove any mocks for `execSync` related to the old hook commands.
    4.  Assert that the retry loop continues when `checkResult.success` is false.
    5.  Assert that the `currentPrompt` variable for the next loop iteration matches the expected auto-generated feedback string.

#### 6. Rewrite Documentation

*   **Objective:** Update the `README.md` to be accurate and reflect the simplicity of the final feature.
*   **Task:**
    1.  Navigate to `README.md`.
    2.  Find the "Advanced: Step Hooks and Self-Correction" section and rename it to something like "Automatic Retries on Failure".
    3.  Rewrite the entire section to explain the new `retry` property.
    4.  Remove all mentions of `hooks`, `onCheckFailure`, and the `{check_output}` token.
    5.  Provide a clear example showing a step with the `retry: 3` property.

### Error Handling & Warnings

*   The existing error handling for the retry loop (exhausting all retries) remains valid and sufficient.
*   If a user provides a non-numeric value for `retry`, it will be treated as `undefined`, resulting in 0 retries. This is acceptable default behavior.