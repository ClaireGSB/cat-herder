# PLAN: Codebase Refactoring for Maintainability

**Goal:** To refactor the existing codebase into smaller, more modular files that adhere to the principles of Separation of Concerns (SoC) and Don't Repeat Yourself (DRY), without altering any existing functionality.

## Description

The project has grown, and several key files, particularly `orchestrator.ts` and `web.ts`, have become overly large and complex. This makes them difficult to navigate, maintain, and test.

This refactoring initiative will restructure the code by breaking down large files into smaller, single-responsibility modules. The goal is to improve code clarity, make the system easier for new developers to understand, and enhance long-term maintainability. The external behavior and functionality of the CLI and web dashboard will remain unchanged.

## Summary Checklist

-   [x] **Refactor Orchestrator Logic**: Decompose the main `orchestrator.ts` file into modules for Git operations, prompt building, and pipeline/step/sequence execution.
-   [x] **Refactor Web Server Logic**: Split the `web.ts` file into modules for server setup, route handling, data access, and WebSocket management.
-   [x] **Refactor CLI Command Handling**: Separate the `commander` setup in `index.ts` from the action implementations.
-   [ ] **Refactor Project Initialization**: Break down `init.ts` into modules for scaffolding files and handling settings hooks.
-   [ ] **Refactor Configuration Validator**: Decompose the `validator.ts` into smaller, focused validation functions.
-   [ ] **Refactor Utility Functions**: Centralize common utilities like ID generation into a dedicated `utils` directory.
-   [ ] **Update Imports and Verify**: Update all module imports across the project and run existing tests to ensure no regressions were introduced.

---

## Detailed Implementation Steps

### 1. Refactor Orchestrator Logic

**Objective:** To break down the monolithic `src/tools/orchestrator.ts` into smaller, more focused modules responsible for distinct parts of the orchestration process.

**Task:** Create a new directory `src/tools/orchestration/` and move logic from `orchestrator.ts` into the following new files. The original `orchestrator.ts` will become a coordinator that imports from these new modules.

1.  **`src/tools/orchestration/git.ts`**
    *   **Responsibility:** All Git-related operations.
    *   **Functions to move:**
        ```typescript
        function taskPathToBranchName(taskPath: string, projectRoot: string): string;
        function ensureCorrectGitBranch(config: ClaudeProjectConfig, projectRoot: string, taskPath: string): string;
        function ensureCorrectGitBranchForSequence(branchName: string, projectRoot: string): string;
        ```

2.  **`src/tools/orchestration/prompt-builder.ts`**
    *   **Responsibility:** Assembling the final prompt sent to the AI.
    *   **Function to move:**
        ```typescript
        function assemblePrompt(pipeline: PipelineStep[], currentStepName: string, context: Record<string, string>, commandInstructions: string): string;
        ```

3.  **`src/tools/orchestration/step-runner.ts`**
    *   **Responsibility:** Executing a single step within a pipeline, including retry logic and rate limit handling.
    *   **Function to move:**
        ```typescript
        async function executeStep(stepConfig: PipelineStep, ...);
        ```

4.  **`src/tools/orchestration/pipeline-runner.ts`**
    *   **Responsibility:** Managing the execution of the entire pipeline for a single task.
    *   **Function to move:**
        ```typescript
        async function executePipelineForTask(taskPath: string, options: {...}): Promise<void>;
        ```

5.  **`src/tools/orchestration/sequence-runner.ts`**
    *   **Responsibility:** Managing the execution of a multi-task sequence.
    *   **Functions to move:**
        ```typescript
        function findNextAvailableTask(folderPath: string, statusFile: string): string | null;
        export async function runTaskSequence(taskFolderPath: string): Promise<void>;
        ```

6.  **`src/tools/orchestrator.ts` (Refactored)**
    *   **Responsibility:** The main public-facing entry point for running tasks and sequences. It will now import and call the functions from the new modules.
    *   **Functions to keep:**
        ```typescript
        export async function runTask(taskRelativePath: string, pipelineOption?: string);
        // The implementation of runTaskSequence will move to sequence-runner.ts,
        // but this file will still export it.
        export { runTaskSequence } from './orchestration/sequence-runner.js';
        ```

### 2. Refactor Web Server Logic

**Objective:** To decompose the monolithic `src/tools/web.ts` file into modules based on web application layers (server, routes, data access, real-time).

**Task:** Create a new directory `src/tools/web/` and move logic from `web.ts` into the following new files. The original `web.ts` will become the entry point to start the server.

1.  **`src/tools/web/data-access.ts`**
    *   **Responsibility:** All functions that read data from the filesystem (state files, logs, journal).
    *   **Functions to move:**
        ```typescript
        function buildTaskHistoryFromJournal(...): TaskStatus[];
        function buildSequenceHistoryFromJournal(...): SequenceStatus[];
        function getTaskDetails(...): TaskDetails | null;
        function getSequenceDetails(...): SequenceDetails | null;
        function readLogFile(...): string | null;
        // ... and other similar data-fetching functions.
        ```

2.  **`src/tools/web/routes.ts`**
    *   **Responsibility:** All Express route handlers.
    *   **Implementation:**
        ```typescript
        // src/tools/web/routes.ts
        import { Router } from 'express';
        import * as dataAccess from './data-access';

        export function createRouter(): Router {
          const router = Router();
          router.get('/history', async (req, res) => { /* ... */ });
          router.get('/live', async (req, res) => { /* ... */ });
          router.get('/task/:taskId', (req, res) => { /* ... */ });
          // ... all other app.get() handlers
          return router;
        }
        ```

3.  **`src/tools/web/websockets.ts`**
    *   **Responsibility:** WebSocket server setup, connection handling, and file watcher logic for real-time updates.
    *   **Implementation:**
        ```typescript
        // src/tools/web/websockets.ts
        import { WebSocketServer } from 'ws';
        import { Server } from 'node:http';

        export function setupWebSockets(server: Server): void {
          const wss = new WebSocketServer({ server, path: '/ws' });
          wss.on('connection', (ws) => {
            // ... all WebSocket and chokidar logic here
          });
        }
        ```

4.  **`src/tools/web/template-helpers.ts`**
    *   **Responsibility:** Helper functions passed to the EJS templates.
    *   **Functions to move:**
        ```typescript
        const formatDuration = (seconds: number | undefined | null): string => { /* ... */ };
        const formatModelName = (modelId: string): string => { /* ... */ };
        ```

5.  **`src/tools/web.ts` (Refactored)**
    *   **Responsibility:** Set up the Express app, create the HTTP server, and start listening.
    *   **Implementation:**
        ```typescript
        // src/tools/web.ts (refactored)
        import express from 'express';
        import { createServer } from 'node:http';
        import { createRouter } from './web/routes';
        import { setupWebSockets } from './web/websockets';

        export async function startWebServer() {
          const app = express();
          const server = createServer(app);
          
          app.set("view engine", "ejs");
          // ... other app settings
          app.use(createRouter());

          setupWebSockets(server);

          server.listen(5177, () => { /* ... */ });
        }
        ```

### 3. Refactor CLI Command Handling

**Objective:** To separate the command-line interface definition in `src/index.ts` from the implementation of the commands themselves.

**Task:** Create a new file `src/cli-actions.ts` to house the logic for each command.

1.  **`src/cli-actions.ts`**
    *   **Responsibility:** Contains the action handler functions for each CLI command.
    *   **Functions to move from `index.ts`:**
        ```typescript
        export async function initAction();
        export async function runAction(taskPath, options);
        export async function runSequenceAction(taskFolderPath);
        export async function validateAction();
        export function fixPermissions(projectRoot: string, permissionsToAdd: string[]);
        // ... and actions for web, tui, status, watch
        ```

2.  **`src/index.ts` (Refactored)**
    *   **Responsibility:** Define the `commander` program, commands, and options, and link them to the action handlers imported from `cli-actions.ts`.
    *   **Code Snippet (Before):**
        ```typescript
        // src/index.ts (before)
        program
          .command("run <taskPath>")
          .action(async (taskPath, options) => {
            try {
              await runTask(taskPath, options.pipeline);
            } catch (error: any) { /* ... */ }
          });
        ```    *   **Code Snippet (After):**
        ```typescript
        // src/index.ts (after)
        import { runAction } from './cli-actions.js';

        program
          .command("run <taskPath>")
          .option("-p, --pipeline <name>", "...")
          .action(runAction);
        ```

### 4. Refactor Project Initialization

**Objective:** To break down the complex initialization logic in `src/init.ts` into more focused modules.

**Task:** Create a new directory `src/init/` and split the logic from `init.ts`.

1.  **`src/init/settings-handler.ts`**
    *   **Responsibility:** Logic for checking, prompting, and merging the required validation hook into `.claude/settings.json`.
    *   **Functions to move:**
        ```typescript
        async function handleExistingSettings(...);
        function doesHookExist(...): boolean;
        function mergeHook(...): any;
        function promptToAddHook(...): Promise<void>;
        ```

2.  **`src/init.ts` (Refactored)**
    *   **Responsibility:** The main `init` function that orchestrates scaffolding and settings handling.
    *   **Implementation:** The main `init` function will remain but will now call `handleExistingSettings` imported from the new module, making its own logic simpler.

### 5. Refactor Configuration Validator

**Objective:** To make the `validatePipeline` function in `src/tools/validator.ts` more readable by breaking it down into smaller functions that validate specific parts of the configuration.

**Task:** Create new internal functions within `validator.ts`.

1.  **`src/tools/validator.ts` (Refactored)**
    *   **Responsibility:** Validate the entire `claude.config.js` file.
    *   **New Internal Functions:**
        ```typescript
        function validateStep(step, stepId, userScripts, errors, missingPermissions);
        function validateCheckObject(check, checkId, userScripts, errors);
        function validateFileAccess(fileAccess, stepId, errors);
        function validatePermissions(commandFilePath, stepId, allowedPermissions, errors, missingPermissions);
        ```    *   **Main Function:** The `validatePipeline` function will be simplified to a loop that calls these new, more granular validation functions for each step.

### 6. Refactor Utility Functions

**Objective:** To consolidate broadly used, pure utility functions into a centralized location.

**Task:** Move ID generation functions from `src/tools/status.ts` to a new utility file.

1.  **`src/utils/id-generation.ts`**
    *   **Responsibility:** Generating consistent IDs from file and folder paths.
    *   **Functions to move:**
        ```typescript
        export function taskPathToTaskId(taskPath: string, projectRoot: string): string;
        export function folderPathToSequenceId(folderPath: string): string;
        ```
2.  **`src/tools/status.ts` (Refactored)**
    *   **Responsibility:** Type definitions and functions for reading/writing status files. It will now import the ID generation functions.

### 7. Update Imports and Verify

**Objective:** To ensure the application compiles and runs correctly after the refactoring.

**Task:**
1.  Go through every modified file and update the `import` statements at the top to point to the new locations of the moved functions.
2.  Run the TypeScript compiler (`npm run build`) to check for any import errors.
3.  Run all existing tests (`npm test`) to confirm that no functionality has been broken.
4.  Manually run the key commands (`claude-project init`, `claude-project run`, `claude-project web`) in a test project to perform a final sanity check.