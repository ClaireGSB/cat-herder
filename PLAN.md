

# PLAN.md

## Title: Refactor Pipeline Hooks to Remove `preCheck`

**Goal:** To simplify the hooks feature by removing the `preCheck` hook, focusing exclusively on the robust `onCheckFailure` self-correction mechanism to improve clarity and ease of use.

### Description

The current implementation includes two types of hooks: `preCheck` and `onCheckFailure`. While functional, the `preCheck` hook (a hard-fail gate) is redundant with the main `check` and adds unnecessary complexity to the configuration.

This refactor will remove the `preCheck` hook entirely. We will streamline the feature to its most powerful and predictable component: the `onCheckFailure` hook. This simplifies the code, makes the configuration cleaner, and focuses the feature on its core benefit: enabling Claude to self-correct when the primary validation fails.

### Summary Checklist

-   [x] **1. Update Configuration Types:** Remove the `preCheck` property from the `PipelineStep` interface in `src/config.ts`.
-   [x] **2. Simplify Orchestrator Logic:** Remove the code that executes `preCheck` hooks from the `executeStep` function in `src/tools/orchestrator.ts`.
-   [x] **3. Update Example Configuration:** Remove any `preCheck` examples from the default template in `src/templates/claude.config.js`.
-   [ ] **4. Adjust Unit Tests:** Update `test/orchestrator-hooks.test.ts` to remove any tests that validate the `preCheck` functionality.
-   [ ] **5. Update Project Documentation:** Remove all mentions of the `preCheck` hook from `README.md`, focusing the documentation entirely on `onCheckFailure`.

---

### Detailed Implementation Steps

#### 1. Update Configuration Types

*   **Objective:** Remove the `preCheck` property from the type definition to enforce the new, simpler configuration structure.
*   **Task:**
    1.  Navigate to `src/config.ts`.
    2.  In the `PipelineStep` interface, find the `hooks` property.
    3.  Delete the `preCheck?: HookConfig[];` line.
*   **Code Snippet (`src/config.ts`):**
    ```typescript
    // BEFORE
    export interface PipelineStep {
      // ...
      hooks?: {
        preCheck?: HookConfig[];
        onCheckFailure?: HookConfig[];
      };
    }

    // AFTER
    export interface PipelineStep {
      // ...
      hooks?: {
        onCheckFailure?: HookConfig[];
      };
    }
    ```

#### 2. Simplify Orchestrator Logic

*   **Objective:** Remove the code that executes `preCheck` hooks from the orchestrator's retry loop.
*   **Task:**
    1.  Navigate to `src/tools/orchestrator.ts`.
    2.  In the `executeStep` function, find the section within the `for` loop that calls `executeHooks` for `preCheck`.
    3.  Delete this entire block of code.
*   **Code Snippet (What to remove from `src/tools/orchestrator.ts`):**
    ```typescript
    // Inside the `executeStep` retry loop, DELETE the following block:

    // Execute preCheck hooks
    try {
      executeHooks(hooks?.preCheck, projectRoot, name, "Pre-check");
    } catch (error) {
      updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
      throw error;
    }
    ```

#### 3. Update Example Configuration

*   **Objective:** Ensure the default configuration template is clean and only shows the `onCheckFailure` hook.
*   **Task:**
    1.  Navigate to `src/templates/claude.config.js`.
    2.  Check the `implement` step (and any others).
    3.  If a `preCheck` key exists in any `hooks` object, delete it. (Note: The previous plan did not add one to the template, so this is mainly a verification step).

#### 4. Adjust Unit Tests

*   **Objective:** Ensure the test suite is up-to-date and only tests existing functionality.
*   **Task:**
    1.  Navigate to `test/orchestrator-hooks.test.ts`.
    2.  Delete any test cases that were specifically written to validate the behavior of the `preCheck` hook. For example, a test named "should fail immediately if a preCheck hook fails".
    3.  Ensure the remaining tests for the `onCheckFailure` retry loop are still valid and passing.

#### 5. Update Project Documentation

*   **Objective:** Make the `README.md` accurate and easy for users to understand by removing all references to the now-defunct `preCheck` hook.
*   **Task:**
    1.  Navigate to `README.md`.
    2.  Search the document for the term `preCheck`.
    3.  Remove any sentences or list items that explain what `preCheck` is or how to use it.
    4.  Ensure the "Advanced: Step Hooks and Self-Correction" section reads clearly, focusing exclusively on the power and usage of the `onCheckFailure` hook.
    5.  Verify that all code examples in the documentation reflect the simplified configuration (with no `preCheck` property).