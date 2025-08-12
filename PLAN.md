# **PLAN.md**

## **Title: Implement Dynamic Task Sequence Orchestrator**

**Goal:** To enable the execution of an ordered sequence of tasks from a single folder, where tasks can dynamically create subsequent tasks within the same run and on the same Git branch.

---

### **Description**

Currently, the `claude-project` tool is designed to run a single task file from start to finish. This is insufficient for complex features that require multiple, ordered steps that might not be known ahead of time.

This change introduces a new `run-sequence` command that targets a folder of tasks. It will execute them sequentially on a single feature branch. Critically, after each task completes, the orchestrator will re-scan the folder for new tasks. This allows an initial task (e.g., "break down this PRD") to generate the rest of the tasks in the queue, creating a fully autonomous, multi-step workflow.

---

### **Summary Checklist**

-   [x] **1. Add New CLI Command:** Create the user-facing `claude-project run-sequence <folderPath>` command.
-   [ ] **2. Define Sequence State:** Create the data structures and helper functions for managing the state of an entire sequence.
-   [ ] **3. Refactor Core Pipeline Execution:** Decouple the existing pipeline logic from Git management so it can be reused.
-   [ ] **4. Implement the Dynamic Sequence Orchestrator:** Build the main "worker loop" that finds and executes tasks dynamically.
-   [ ] **5. Implement Helper Functions:** Create the logic for finding the next task and managing the sequence's Git branch.
-   [ ] **6. Add Integration Test:** Create a new test case to validate the end-to-end dynamic sequence workflow.
-   [ ] **7. Update Documentation:** Add a section to `README.md` explaining the new feature and how to use it.

---

### **Detailed Implementation Steps**

#### 1. Add New CLI Command `run-sequence`

*   **Objective:** To create the user-facing entry point for the new feature.
*   **Task:**
    1.  Open `src/index.ts`.
    2.  Add a new `program.command()` definition for `run-sequence`.
    3.  This command should accept one argument: `<taskFolderPath>`.
    4.  It should call a new, yet-to-be-created function named `runTaskSequence` from `src/tools/orchestrator.ts`.
*   **Code Snippet (in `src/index.ts`):**
    ```typescript
    // ... inside src/index.ts, after the 'run' command definition

    // 'run-sequence' command
    program
      .command("run-sequence <taskFolderPath>")
      .description("Runs a dynamic sequence of tasks from a specified folder.")
      .action(async (taskFolderPath) => {
        try {
          // This is the new function we will create in the orchestrator file.
          await runTaskSequence(taskFolderPath);
        } catch (error: any) {
          console.error(pc.red(`\nSequence failed: ${error.message}`));
          process.exit(1);
        }
      });
    ```

#### 2. Define the New `SequenceStatus` State

*   **Objective:** To create a robust data structure for tracking the state of an entire task sequence in a single JSON file.
*   **Task:**
    1.  Open `src/tools/status.ts`.
    2.  Define a new exported interface named `SequenceStatus`. It must track the overall phase, the current task, and a list of completed tasks.
    3.  Create new helper functions `readSequenceStatus` and `updateSequenceStatus` to manage this new state object, similar to the existing `readStatus` and `updateStatus`.
    4.  **Note:** The status file itself will be stored in the configured `statePath`. Its name should be derived from the sequence folder path to ensure uniqueness (e.g., `claude-Tasks/my-feature` could produce `sequence-my-feature.state.json`).
*   **Code Snippet (in `src/tools/status.ts`):**
    ```typescript
    export type SequencePhase = "pending" | "running" | "done" | "failed";

    export interface SequenceStatus {
      version: number;
      sequenceId: string;
      branch: string;
      phase: SequencePhase;
      currentTaskPath: string | null; // The absolute path of the task being executed
      completedTasks: string[];      // An array of absolute paths to tasks already done
      lastUpdate: string;
    }

    // You will also implement:
    // export function readSequenceStatus(file: string): SequenceStatus { ... }
    // export function updateSequenceStatus(file: string, mut: (s: SequenceStatus) => void) { ... }
    ```

#### 3. Refactor Core Pipeline Execution

*   **Objective:** To extract the pipeline execution logic from the existing `runTask` function into a reusable helper that can be called by both the old `run` command and the new `run-sequence` loop.
*   **Task:**
    1.  Open `src/tools/orchestrator.ts`.
    2.  Create a new, un-exported function `executePipelineForTask(taskPath, options)`.
    3.  Move the core logic from `runTask` (the part that reads a task file, determines the pipeline, and loops through the steps to call `executeStep`) into `executePipelineForTask`.
    4.  Modify the original `runTask` function so it now primarily handles its unique Git branch creation and then calls `executePipelineForTask`.
    5.  The new `executePipelineForTask` should accept an `options` object to control its behavior (e.g., `{ skipGitManagement: true }`).

#### 4. Implement the Dynamic Sequence Orchestrator

*   **Objective:** To build the main "worker loop" that dynamically finds and executes tasks from the target folder.
*   **Task:**
    1.  Open `src/tools/orchestrator.ts`.
    2.  Create the new exported function `runTaskSequence(taskFolderPath)`.
    3.  **Inside this function:**
        *   Perform initial setup: generate a unique sequence ID from the folder path, determine the status file path, and set up the single Git branch for the sequence.
        *   Implement a `while` loop. The loop continues as long as a call to `findNextAvailableTask()` returns a valid task path.
        *   Inside the loop, use a `try...catch` block to gracefully handle task failures.
        *   Within the `try` block, call the refactored `executePipelineForTask()` for the current task.
        *   Update the `SequenceStatus` file to mark the task as complete before the next iteration.
        *   In the `catch` block, update the sequence status to `"failed"`, log the error, and break the loop.
*   **Code Snippet (Conceptual structure for `runTaskSequence`):**
    ```typescript
    export async function runTaskSequence(taskFolderPath: string) {
      // 1. Setup: get config, derive sequence ID, determine statusFile path, create sequence branch.

      let nextTaskPath = findNextAvailableTask(taskFolderPath, statusFile);

      while (nextTaskPath) {
        try {
          console.log(`[Sequence] Starting task: ${path.basename(nextTaskPath)}`);
          
          // 2. Update status to "running" for this task.
          updateSequenceStatus(statusFile, s => { 
            s.currentTaskPath = nextTaskPath;
            s.phase = "running"; 
          });
          
          // 3. Execute the task's pipeline.
          await executePipelineForTask(nextTaskPath, { skipGitManagement: true });

          // 4. Mark task as "done" and reset phase for next search.
          updateSequenceStatus(statusFile, s => { 
              s.completedTasks.push(nextTaskPath);
              s.currentTaskPath = null;
              s.phase = "pending";
          });
          
          // 5. Look for the next task (which may have just been created).
          nextTaskPath = findNextAvailableTask(taskFolderPath, statusFile);

        } catch (error) {
            console.error(`[Sequence] HALTING: Task failed with error: ${error.message}`);
            updateSequenceStatus(statusFile, s => { s.phase = "failed"; });
            break; // Exit the loop on failure
        }
      }

      const finalStatus = readSequenceStatus(statusFile);
      if (finalStatus.phase !== 'failed') {
          console.log("[Sequence] No more tasks found. All done!");
          updateSequenceStatus(statusFile, s => { s.phase = "done"; });
      }
    }
    ```

#### 5. Implement Helper Functions

*   **Objective:** To create the specific logic needed by the sequence orchestrator for finding tasks and managing Git.
*   **Task:**
    1.  In `src/tools/orchestrator.ts`:
        *   Implement `findNextAvailableTask(folderPath, statusFile)`. This function must:
            1.  Read the `completedTasks` array from the `statusFile`.
            2.  Read the contents of the `folderPath` from the disk.
            3.  Filter out any tasks that are already complete.
            4.  Sort the remaining tasks alphabetically and return the absolute path to the first one (or `null`).
        *   Implement `folderPathToSequenceId(folderPath)` to create a friendly and unique ID (e.g., `claude-Tasks/feature-x` -> `sequence-feature-x`). This ID will be used for both the Git branch and the state file name to ensure consistency.
        *   Implement `ensureCorrectGitBranchForSequence(branchName, ...)` to set up the single branch for the entire run.

#### 6. Add Integration Test

*   **Objective:** To create an automated test that validates the new feature works correctly from end-to-end.
*   **Task:**
    1.  Create a new test file: `test/sequence-orchestrator.test.ts`.
    2.  The test case should perform the following steps:
        *   Programmatically create a temporary test directory with a subfolder (e.g., `temp-tasks/my-dynamic-feature`).
        *   Add one initial task file, `01-create-tasks.md`, to this folder.
        *   The prompt for this task should instruct Claude to use the `Write` tool to create two new files: `02-next-step.md` and `03-final-step.md`.
        *   Invoke `runTaskSequence()` on the test directory.
        *   Assert that all three tasks were executed in the correct order (`01`, `02`, `03`).
        *   Assert that all commits were made to the same, single Git branch.

#### 7. Update Documentation

*   **Objective:** To clearly explain the new feature to end-users in the project's main documentation.
*   **Task:**
    1.  Open `README.md`.
    2.  Add a new major section titled "Running Task Sequences".
    3.  In this section, explain:
        *   The purpose of the `run-sequence` command.
        *   The key benefit: dynamic task creation for complex workflows.
        *   A clear example of the command-line usage: `claude-project run-sequence claude-Tasks/my-feature`.
        *   A brief explanation of how it works (one branch, sequential execution, re-scanning the folder).
        *   **A note on task ordering:** Explain that tasks are executed alphabetically by filename and recommend a naming convention like `01-setup.md`, `02-implement.md` when a specific order is required.

---

### **Error Handling & Warnings**

*   **Empty or Missing Folder:** If the `<taskFolderPath>` provided to `run-sequence` does not exist or contains no `.md` files at the start, the command should fail immediately with a clear error message: `Error: No task files (.md) found in folder: <folderPath>`.
*   **Task Failure:** If any task within the sequence fails (as handled in Step 4), the entire sequence must halt immediately. The orchestrator should log which task and step failed, and the `SequenceStatus` phase should be set to `"failed"`.
*   **Git State:** The sequence command should perform the same initial check as the `run` command: fail if the Git working directory is not clean.
*   **Logging:** Ensure logs clearly distinguish between the overall Sequence Orchestrator and the individual Task Pipeline. Use prefixes like `[Sequence]` for high-level actions.