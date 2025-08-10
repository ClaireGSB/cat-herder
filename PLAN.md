\

# PLAN.md

## Title & Goal

**Title:** Enable Multiple Checks per Pipeline Step

**Goal:** To allow a user to define an array of `check` objects for a single pipeline step, which will be executed sequentially to provide more granular validation.

## Description

Currently, each step in a `claude.config.js` pipeline can only have a single `check` object. This forces users to chain multiple validation commands together in a single shell script (e.g., `npm run typecheck && npm test`). This approach is not intuitive and provides poor feedback, as it's not immediately clear which part of the chained command failed.

This change will update the system to accept an array of `check` objects. The orchestrator will execute each check in order, and if any single check fails, the entire step validation will fail immediately. This makes the pipeline configuration cleaner, more readable, and provides more precise error feedback.

## Summary Checklist

-   [x] **Interfaces:** Update `PipelineStep` interface to accept `CheckConfig | CheckConfig[]`.
-   [ ] **Check Runner:** Modify `check-runner.ts` to process an array of checks sequentially.
-   [ ] **Orchestrator:** Adjust the retry feedback logic in `orchestrator.ts` to handle failures from a specific check within an array.
-   [ ] **Validator:** Update `validator.ts` to validate both single and array-based `check` configurations.
-   [ ] **Templates:** Update the default `claude.config.js` template to use a multi-check example.
-   [ ] **Documentation:** Update `README.md` to document the new feature and provide usage examples.

## Detailed Implementation Steps

### 1. Update Core Interfaces

*   **Objective:** Modify the core data structures to officially support an array of checks.
*   **Task:**
    1.  Go to `src/config.ts`.
    2.  Locate the `PipelineStep` interface.
    3.  Change the `check` property's type to allow for an array of `CheckConfig` objects.
*   **Code Snippet (`src/config.ts`):**
    ```typescript
    // Before
    export interface PipelineStep {
      //...
      check: CheckConfig;
      //...
    }

    // After
    export interface PipelineStep {
      //...
      check: CheckConfig | CheckConfig[];
      //...
    }
    ```

### 2. Implement Multi-Check Logic

*   **Objective:** Rework the check runner to execute each check in a sequence if an array is provided.
*   **Task:**
    1.  Open `src/tools/check-runner.ts`.
    2.  Modify the `runCheck` function to handle both a single `check` object and an array of them.
    3.  If the input is an array, loop through it and execute each check.
    4.  If any check fails, the function should immediately return a `CheckResult` with `success: false` and the specific error output. Do not proceed to the next check.
    5.  If all checks in the array pass, return `{ success: true }`.
*   **Code Snippet (`src/tools/check-runner.ts`):**
    ```typescript
    // Change the function signature
    export async function runCheck(checkConfig: CheckConfig | CheckConfig[], projectRoot: string): Promise<CheckResult> {
      
      // Add a wrapper function for single check logic
      async function runSingleCheck(singleCheck: CheckConfig): Promise<CheckResult> {
        console.log(`\n[Orchestrator] Running check: ${pc.yellow(singleCheck.type)}`);
        // ... (existing switch statement logic for a single check)
      }

      if (Array.isArray(checkConfig)) {
        for (const [index, singleCheck] of checkConfig.entries()) {
          console.log(`[Orchestrator] Running check ${index + 1}/${checkConfig.length}...`);
          const result = await runSingleCheck(singleCheck); // Use the wrapper
          if (!result.success) {
            // Immediately fail and return the result from the failing check
            return result;
          }
        }
        // All checks in the array passed
        return { success: true };
      } else {
        // It's a single check object, run as before
        return runSingleCheck(checkConfig);
      }
    }
    ```

### 3. Adjust Orchestrator Feedback

*   **Objective:** Ensure the retry prompt clearly states which check failed when using a multi-check array.
*   **Task:**
    1.  Open `src/tools/orchestrator.ts`.
    2.  In the `executeStep` function, locate the `feedbackPrompt` generation logic.
    3.  The `check` variable in this scope will be the array. The `checkResult` from `runCheck`, however, will contain the details of the *single* check that failed. The existing code that uses `checkResult.output` should work correctly.
    4.  The part of the prompt that shows the command, `\`${check.command}\``, will be problematic because `check` is an array. You should improve the feedback to be more generic if it's an array or pinpoint the failing check if possible. A simple solution is to just describe the validation failed without mentioning the specific command.
*   **Code Snippet (`src/tools/orchestrator.ts`):**
    ```typescript
    // Before
    const feedbackPrompt = `...
    The automated validation check (\`${check.command}\`) failed with the following error output:
    ...`;

    // After (conceptual change)
    const checkDescription = Array.isArray(check) 
        ? 'One of the validation checks' 
        : `The validation check (\`${check.command}\`)`;
        
    const feedbackPrompt = `...
    ${checkDescription} failed with the following error output:
    --- ERROR OUTPUT ---
    ${checkResult.output || 'No output captured'}
    --- END ERROR OUTPUT ---
    ...`;
    ```

### 4. Update the Pipeline Validator

*   **Objective:** Make `claude-project validate` aware of the new array format so it can correctly validate configurations.
*   **Task:**
    1.  Open `src/tools/validator.ts`.
    2.  In `validatePipeline`, find the loop that iterates through each pipeline `step`.
    3.  Inside the loop, check if `step.check` is an array.
    4.  If it is, loop through the array and apply the existing validation logic to each `CheckConfig` object within it.
    5.  Make sure any error messages clearly state the index of the failing check (e.g., `Step 'write_tests', check #2: ...`).

### 5. Update Configuration Templates

*   **Objective:** Provide a clear, real-world example of the new feature in the default configuration file.
*   **Task:**
    1.  Open `src/templates/claude.config.js`.
    2.  Find the `write_tests` step in the `default` pipeline.
    3.  Modify its `check` property to be an array of two checks: one for typechecking (expected to pass) and one for tests (expected to fail).
*   **Code Snippet (`src/templates/claude.config.js`):**
    ```javascript
    // In the 'write_tests' step
    check: [
      { type: "shell", command: "npx tsc --noEmit", expect: "pass" },
      { type: "shell", command: "npm test", expect: "fail" }
    ],
    ```

### 6. Update Documentation

*   **Objective:** Document the new feature for all users.
*   **Task:**
    1.  Open `README.md`.
    2.  Navigate to the **`Check Types`** section.
    3.  Add a new subsection explaining that the `check` property can accept an array of check objects for sequential validation.
    4.  Include a clear example, like the one from the `write_tests` step.
    5.  Explain that the checks run in order and the entire step will fail if any one of them fails.

## Error Handling & Warnings

*   **Configuration Errors:** The `validate` command will now detect and report invalid `check` objects within a check array, specifying their position (e.g., "Pipeline 'default', Step 2, Check #1: Invalid check type").
*   **Runtime Failures:** When a step fails during a run, the console output should clearly indicate which check in the sequence failed. For example:
    ```
    [Orchestrator] Running check 1/2...
    [Orchestrator] Running check: shell
      › Executing: "npx tsc --noEmit" (expecting to pass)
      ✔ Check passed: Command succeeded as expected.
    [Orchestrator] Running check 2/2...
    [Orchestrator] Running check: shell
      › Executing: "npm test" (expecting to fail)
      ✖ Check failed: Validation failed: Command "npm test" succeeded but was expected to fail.
    ```