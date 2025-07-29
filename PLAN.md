

### PLAN.md

#### 1. Title & Goal

**Title:** Implement Declarative, Pipeline-Driven File Access Guardrails

**Goal:** To refactor the workflow validation logic so that it is defined directly within the user's `claude.config.js` pipeline, making the enforcement of rules flexible, transparent, and non-opinionated.

---

#### 2. Description

Currently, our tool uses a hardcoded validator script (`validators.ts`) to enforce a specific Test-Driven Development (TDD) workflow. This is too rigid and conflicts with our goal of providing a fully customizable pipeline. If a user renames or removes the `write_tests` step, the current validation logic breaks.

The new behavior will allow users to declaratively define file write permissions (`allowWrite`) for each step in their `claude.config.js`. A single, generic `PreToolUse` hook will then read the current step and its corresponding rules from the user's config, enforcing them at runtime. This makes the guardrails adaptable to any pipeline structure the user creates, including workflows that do not involve tests.

---

#### 3. Summary Checklist

-   [x] **Configuration:** Update `claude.config.js` type definitions and the default template to include the new `fileAccess` property.
-   [x] **Implementation:** Create the new generic `pipeline-validator.ts` script to enforce these declarative file access rules.
-   [x] **Integration:** Update `src/dot-claude/settings.json` to replace the old hook with the new generic validator hook.
-   [x] **Cleanup:** Remove the old, hardcoded `validators.ts` script from the project.
-   [ ] **Documentation:** Update the `README.md` file to document the new `fileAccess` feature and explain how users can customize it.

---

#### 4. Detailed Implementation Steps

##### **Step 1: Update Configuration & Templates**

*   **Objective:** Modify the core configuration types and the user-facing template to support the new `fileAccess` property. This makes the feature available to users.
*   **Tasks:**
    1.  Modify `src/config.ts`:
        *   Find the `PipelineStep` interface.
        *   Add a new optional property: `fileAccess?: { allowWrite?: string[] }`.
    2.  Modify `src/templates/claude.config.js`:
        *   For each step in the default `pipeline` array, add the new `fileAccess` property.
        *   Populate it with sensible defaults that match the step's purpose.

*   **Code Snippet (`src/config.ts`):**
    ```typescript
    export interface PipelineStep {
      name: string;
      command: string;
      context: string[];
      check: CheckConfig;
      fileAccess?: { // <-- Add this new property
        allowWrite?: string[];
      };
    }
    ```

*   **Code Snippet (`src/templates/claude.config.js`):**
    ```javascript
    // ... inside the pipeline array ...
    {
      name: "write_tests",
      command: "write-tests",
      context: ["planContent", "taskDefinition"],
      check: { type: "shell", command: "npm test", expect: "fail" },
      // Add this block
      fileAccess: {
        allowWrite: ["test/**/*", "tests/**/*"]
      }
    },
    {
      name: "implement",
      command: "implement",
      context: ["planContent"],
      check: { type: "shell", command: "npm test", expect: "pass" },
      // Add this block
      fileAccess: {
        allowWrite: ["src/**/*"]
      }
    },
    ```

##### **Step 2: Create the Generic Validator Script**

*   **Objective:** Implement the core logic that dynamically enforces the rules from the user's configuration at runtime.
*   **Tasks:**
    1.  Create a new file: `src/tools/pipeline-validator.ts`.
    2.  The script must read JSON data from `stdin` to get the `file_path` Claude intends to edit.
    3.  It needs to identify the currently running task by finding the most recently modified `.state.json` file in the configured `statePath`.
    4.  From the state file, it must extract the `currentStep` name.
    5.  It will then load the user's `claude.config.js` to get the full pipeline definition.
    6.  It must find the step in the pipeline that matches the `currentStep` name and retrieve its `fileAccess.allowWrite` array.
    7.  You will need a glob-matching utility. `minimatch` is a good choice as it is already a dependency of `glob`. Add it to the project's dependencies.
    8.  Check if the `file_path` from stdin matches any of the glob patterns in the `allowWrite` array.

##### **Step 3: Integrate the New Hook**

*   **Objective:** Point the default `PreToolUse` hook to the new generic validator so it runs automatically.
*   **Tasks:**
    1.  Open `src/dot-claude/settings.json`.
    2.  In the `PreToolUse` section, change the `command` to execute the new script.

*   **Code Snippet (`src/dot-claude/settings.json`):**
    ```json
    // Find this line:
    "command": "tsx ./tools/validators.ts preWrite < /dev/stdin"

    // And change it to:
    "command": "tsx ./tools/pipeline-validator.ts < /dev/stdin"
    ```

##### **Step 4: Cleanup**

*   **Objective:** Remove the old, now-redundant script to keep the codebase clean.
*   **Tasks:**
    1.  Delete the file `src/tools/validators.ts`.

---

#### 5. Error Handling & Warnings

*   **No `fileAccess` Property:** If a step in the pipeline has no `fileAccess` property, the validator must gracefully allow the write operation to proceed.
*   **Configuration/State Not Found:** If `claude.config.js` or the task's `.state.json` file cannot be found or parsed, the validator should log a clear error to `stderr` and fail safely by blocking the write operation.
*   **Blocked Action:** When the validator blocks a file write, the error message must be clear and actionable.
    *   **Example Error Message:** `Blocked: The current step 'implement' only allows file modifications matching ["src/**/*"]. Action on 'README.md' denied.`

---

#### 6. Documentation Changes

*   **Objective:** Clearly explain the new `fileAccess` feature to users in the `README.md` so they can customize their workflows.
*   **Tasks:**
    1.  In `README.md`, add a new subsection under "How It Works" titled **"Customizable Guardrails (`fileAccess`)"**.
    2.  Explain what the `fileAccess` property does and show an example of the `allowWrite` array with glob patterns.
    3.  Explain that this feature allows them to control which files Claude can modify at each stage of the pipeline.
    4.  Mention that removing the `fileAccess` property from a step disables the guardrail for that step, providing maximum flexibility.