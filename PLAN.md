
# PLAN.md

### **Title: Enhance `claude-project validate` to Cover All Pipeline Features**

**Goal:** To make the `claude-project validate` command check for all new pipeline configurations (`retry`, `fileAccess`, and deep `check` validation) to prevent runtime errors and provide immediate feedback to the user.

### **Description**

Currently, the `claude-project validate` command checks for basic configuration issues but misses newer features. A user can create a `claude.config.js` with invalid values for `retry`, `fileAccess`, or the `check` object (e.g., `retry: "three"`), and these errors are only discovered when a task is already running. This creates a frustrating user experience.

This task will enhance the validator to catch these errors proactively. The new behavior will inspect the entire pipeline configuration and report specific, helpful error messages, guiding the user to fix their `claude.config.js` *before* they attempt to run a task.

### **Summary Checklist**

-   [ ] **1. Validate `retry` Property**: Update `validator.ts` to ensure `retry` is a non-negative integer.
-   [ ] **2. Deepen `check` Object Validation**: Update `validator.ts` to validate the specific properties required by each `check.type`.
-   [ ] **3. Validate `fileAccess` Object Structure**: Update `validator.ts` to ensure `fileAccess.allowWrite` is an array of strings.
-   [ ] **4. Add Top-Level Config Validation**: Add basic type validation for top-level keys in `claude.config.js`.
-   [ ] **5. Create New Tests**: Add a new test file (`test/validator.test.ts`) to verify all new validation logic.
-   [ ] **6. Update Documentation**: Update `README.md` to reflect the improved capabilities of the `validate` command.

---

### **Detailed Implementation Steps**

#### **1. Validate `retry` Property**

*   **Objective:** Prevent users from providing invalid values for the `retry` property in a pipeline step.
*   **Task:** In `src/tools/validator.ts`, locate the `for` loop that iterates through pipeline steps. Inside this loop, add logic to check the `retry` property.
*   **Code Snippet (to be added in `src/tools/validator.ts`):**
    ```typescript
    // Inside the step validation loop...
    if (step.retry !== undefined) {
      if (typeof step.retry !== 'number' || !Number.isInteger(step.retry) || step.retry < 0) {
        errors.push(`${stepId}: The 'retry' property must be a non-negative integer, but found '${step.retry}'.`);
      }
    }
    ```

#### **2. Deepen `check` Object Validation**

*   **Objective:** Ensure that when a `check.type` is specified, its required fields (like `path` or `command`) are also present and correctly formatted.
*   **Task:** In `src/tools/validator.ts`, right after you validate `step.check.type`, add a `switch` statement to handle the logic for each type.
*   **Code Snippet (to be added in `src/tools/validator.ts`):**
    ```typescript
    // Inside the step validation loop, after checking if step.check.type is valid...
    switch (step.check.type) {
      case 'fileExists':
        if (typeof step.check.path !== 'string' || !step.check.path) {
          errors.push(`${stepId}: Check type 'fileExists' requires a non-empty 'path' string property.`);
        }
        break;
      case 'shell':
        if (typeof step.check.command !== 'string' || !step.check.command) {
          errors.push(`${stepId}: Check type 'shell' requires a non-empty 'command' string property.`);
        }
        if (step.check.expect && !['pass', 'fail'].includes(step.check.expect)) {
          errors.push(`${stepId}: The 'expect' property for a shell check must be either "pass" or "fail".`);
        }
        break;
    }
    ```

#### **3. Validate `fileAccess` Object Structure**

*   **Objective:** Ensure the `fileAccess` object and its `allowWrite` property are structured correctly to prevent runtime validation failures.
*   **Task:** In `src/tools/validator.ts`, inside the step validation loop, add a new block to check the `fileAccess` property if it exists.
*   **Code Snippet (to be added in `src/tools/validator.ts`):**
    ```typescript
    // Inside the step validation loop...
    if (step.fileAccess) {
      if (typeof step.fileAccess !== 'object' || step.fileAccess === null) {
        errors.push(`${stepId}: The 'fileAccess' property must be an object.`);
      } else if (step.fileAccess.allowWrite) {
        if (!Array.isArray(step.fileAccess.allowWrite)) {
          errors.push(`${stepId}: The 'fileAccess.allowWrite' property must be an array of strings.`);
        } else {
          step.fileAccess.allowWrite.forEach((pattern, i) => {
            if (typeof pattern !== 'string' || !pattern) {
              errors.push(`${stepId}: The 'fileAccess.allowWrite' array contains an invalid value at index ${i}. All values must be non-empty strings.`);
            }
          });
        }
      }
    }
    ```

#### **4. Add Top-Level Config Validation**

*   **Objective:** Catch common typos in the main `claude.config.js` keys.
*   **Task:** At the beginning of the `validatePipeline` function in `src/tools/validator.ts`, add a few checks for the most important top-level properties.
*   **Code Snippet (to be added in `src/tools/validator.ts`):**
    ```typescript
    // At the start of the validatePipeline function...
    if (config.manageGitBranch !== undefined && typeof config.manageGitBranch !== 'boolean') {
      errors.push(`Top-level config error: 'manageGitBranch' must be a boolean (true or false).`);
    }
    if (config.taskFolder !== undefined && typeof config.taskFolder !== 'string') {
      errors.push(`Top-level config error: 'taskFolder' must be a string.`);
    }
    ```

#### **5. Create New Tests**

*   **Objective:** Create a dedicated test suite to ensure all new validation rules work correctly and do not break in the future.
*   **Task:**
    1.  Create a new file: `test/validator.test.ts`.
    2.  Import `validatePipeline` from `src/tools/validator.ts` and `describe`, `it`, `expect` from `vitest`.
    3.  Write test cases for each invalid configuration scenario:
        *   A step with `retry: "2"`.
        *   A step with `check: { type: 'fileExists' }` (missing `path`).
        *   A step with `check: { type: 'shell', expect: 'succeed' }` (invalid `expect` value).
        *   A step with `fileAccess: { allowWrite: "src/*" }` (string instead of array).
    4.  For each case, create a mock `config` object, call `validatePipeline`, and assert that `result.isValid` is `false` and `result.errors` contains the expected message.
    5.  Add a final test case with a completely valid `config` to ensure it passes without errors.

#### **6. Update Documentation**

*   **Objective:** Inform users about the expanded capabilities of the `claude-project validate` command in the `README.md`.
*   **Task:** Go to the `README.md` file and find the section describing `claude-project validate` (under `### Permissions and Security (.claude/settings.json)`). Update the description to be more comprehensive.

*   **Suggested Change:**
    *   **FROM:** "The `claude-project validate` command acts as a safety net and a helper. It validates two things: 1. Permissions... 2. Package.json Scripts..."
    *   **TO (suggestion):** "The `claude-project validate` command is an essential tool for ensuring your workflow is correctly configured *before* you run it. It performs a comprehensive check of your `claude.config.js` and project setup, including:
        *   **Pipeline Structure:** Verifies that steps have required properties like `name` and `command`.
        *   **Check Objects:** Ensures `check` steps are correctly formed (e.g., a `fileExists` check has a `path`).
        *   **Retry and FileAccess:** Validates that `retry` and `fileAccess` rules follow the correct format.
        *   **NPM Scripts:** Confirms that any `npm` command used in a `shell` check exists in your `package.json`.
        *   **Permissions:** Detects when a step requires a `Bash` permission that is missing from `.claude/settings.json` and offers to add it for you."

### **Error Handling & Warnings**

*   When the `claude-project validate` command detects any errors, it should list all of them clearly in the console.
*   The command should exit with a non-zero status code to allow for its use in automated scripts.
*   The error messages generated by the new validation logic should be consistent with the existing ones: `Pipeline '...' Step X ('...'): Descriptive error message.`