\

# PLAN: Implement a Self-Contained Web UI Testing Environment

## Title & Goal

**Title:** Set Up a Local, Mock-Data-Driven Web Testing Infrastructure
**Goal:** To create a consistent and reliable way for any developer to test the web dashboard UI locally using a static set of mock data, without needing to run a live AI task.

## Description

Currently, testing the web dashboard is difficult because it depends on the state and log files located in a developer's personal `~/.cat-herder` directory. This data is inconsistent between developers, can be deleted, and requires running a slow, live task to be generated.

This plan outlines the creation of a self-contained test environment. We will capture a "golden set" of mock data and commit it to the repository. We will then create a script that starts the web server configured to use this mock data instead of the live data. This will allow any developer to run a single command and view the web dashboard in a predictable, stable state for manual UI testing and verification.

## Summary Checklist

-   [X] Capture and store mock state and log files in the repository.
-   [X] Create a new test runner script to start the server in "test mode".
-   [X] Refactor the `startWebServer` function to accept custom data paths.
-   [X] Update the `webAction` CLI command to use the newly refactored function.
-   [X] Add a new `npm` script to easily run the test server.
-   [ ] Update the `README.md` with instructions for the new testing workflow.

## Detailed Implementation Steps

### 1. Capture and Store Mock Data

*   **Objective:** To create a static, version-controlled set of realistic data that the test server can use.
*   **Task:**
    1.  First, ensure you have good data to capture. Run a task sequence so that you have state files for sequences, tasks, and corresponding log files.
    2.  In the project's root, create a new directory for this test data: `test/e2e-data/`.
    3.  Go to your home directory and find the `.cat-herder` folder (usually at `~/.cat-herder`).
    4.  Copy the `state` and `logs` directories from `~/.cat-herder` into the newly created `test/e2e-data/` directory.
    5.  The final structure should look like this:
        ```
        test/
        └── e2e-data/
            ├── state/
            │   ├── run-journal.json
            │   └── *.state.json
            └── logs/
                └── <task-id>/
                    └── *.log
        ```
    6.  This mock data can now be committed to Git.

### 2. Create the Test Runner Script

*   **Objective:** To create a dedicated script that starts the web server and points it to our new mock data.
*   **Task:**
    1.  Create a new directory `scripts/` in the project root if it doesn't exist.
    2.  Create a new file inside it named `start-web-test.ts`.
    3.  Add the following code. This script will be our entry point for manual web testing.

*   **Code Snippet (New File):**
    ```typescript
    // scripts/start-web-test.ts
    import path from 'node:path';
    import pc from 'picocolors';
    // Note: We will modify startWebServer in the next step to make this work.
    import { startWebServer } from '../src/tools/web.js';

    async function run() {
      console.log(pc.cyan("--- Starting Web Dashboard in Test Mode ---"));

      const projectRoot = process.cwd();
      const mockStateDir = path.join(projectRoot, 'test', 'e2e-data', 'state');
      const mockLogsDir = path.join(projectRoot, 'test', 'e2e-data', 'logs');

      console.log(pc.yellow(`› Using mock state from: ${mockStateDir}`));
      console.log(pc.yellow(`› Using mock logs from:  ${mockLogsDir}`));

      // We will update startWebServer to accept this options object
      await startWebServer({
        stateDir: mockStateDir,
        logsDir: mockLogsDir,
      });
    }

    run();
    ```

### 3. Refactor `startWebServer` Function

*   **Objective:** To make the `startWebServer` function more flexible so it can use either the default live data paths or the custom mock paths we provide.
*   **Task:** Modify `src/tools/web.ts` to accept an options object.

*   **Code Snippet (`src/tools/web.ts`):**

    **Before:**
    ```typescript
    // ... imports
    export async function startWebServer() {
      const config = await getConfig();
      const projectRoot = getProjectRoot();
      const stateDir = resolveDataPath(config.statePath, projectRoot);
      const logsDir = resolveDataPath(config.logsPath, projectRoot);

      // ... rest of function
    }
    ```

    **After:**
    ```typescript
    // ... imports

    // Define an interface for the options
    interface WebServerOptions {
      stateDir?: string;
      logsDir?: string;
    }

    export async function startWebServer(options: WebServerOptions = {}) {
      const config = await getConfig();
      const projectRoot = getProjectRoot();

      // Use the paths from options if they exist, otherwise fall back to the config
      const stateDir = options.stateDir || resolveDataPath(config.statePath, projectRoot);
      const logsDir = options.logsDir || resolveDataPath(config.logsPath, projectRoot);

      // The rest of the function remains the same
      const app = express();
      const server = createServer(app);
      
      app.set("view engine", "ejs");
      app.set("views", path.resolve(new URL("../templates/web", import.meta.url).pathname));
      app.use(express.static(path.resolve(new URL("../public", import.meta.url).pathname)));
      app.use(createRouter(stateDir, logsDir, config));
      setupWebSockets(server, stateDir, logsDir);

      const port = 5177;
      server.listen(port, () => {
        // Add a check to show if we're in test mode
        if (options.stateDir) {
          console.log(pc.inverse(pc.yellow(" RUNNING IN TEST MODE ")));
        }
        console.log(pc.green(`Status web server running.`));
        console.log(pc.cyan(`›› Open http://localhost:${port} in your browser.`));
      });
    }
    ```

### 4. Update the `webAction` CLI Command

*   **Objective:** To ensure the real `cat-herder web` command continues to function correctly after our refactor.
*   **Task:** Modify `src/cli-actions.ts` to call the updated `startWebServer` function without any options.

*   **Code Snippet (`src/cli-actions.ts`):**

    **Before:**
    ```typescript
    export const webAction = startWebServer;
    ```

    **After:**
    ```typescript
    export async function webAction(): Promise<void> {
      // Call with no options to use the default config-based paths from ~/.cat-herder
      await startWebServer();
    }
    ```

### 5. Add NPM Script

*   **Objective:** To create a simple, memorable command for launching the web server in test mode.
*   **Task:** Add a new script to the `scripts` section of `package.json`.

*   **Code Snippet (`package.json`):**
    ```json
    {
      "scripts": {
        "build": "...",
        "dev": "...",
        "test": "...",
        "test:watch": "...",
        "test:manual:web": "tsx scripts/start-web-test.ts",
        "typecheck": "..."
      }
    }
    ```

## How to Use the New Test Environment

Once all the steps above are completed, the manual testing workflow is as follows:

1.  Run the new command from your terminal:
    ```bash
    npm run test:manual:web
    ```
2.  The server will start and log that it is using the mock data from `test/e2e-data/`.
3.  Open `http://localhost:5177` in your browser.
4.  You can now click through the entire UI, which will be populated with the consistent and predictable mock data.

## Documentation Changes

### Update README.md

*   **Objective:** To inform other developers about this new, improved testing workflow.
*   **Task:** Add a small section to the `README.md` under the "How to Test Locally (for Developers)" section.

*   **Proposed Addition to `README.md`:**

    > ### Part 3: Testing the Web Dashboard
    >
    > To test the web dashboard UI without running a live task, you can use the built-in test environment, which uses a static set of mock data from the `test/e2e-data/` directory.
    >
    > ```bash
    > # In your cat-herder repository root
    > npm run test:manual:web
    > ```    >
    > This will start the web server on `http://localhost:5177` populated with consistent data, allowing you to safely verify UI changes

### update claude.md
*   **Objective:** To ensure the AI assistant is aware of the new testing workflow.
*   **Task:** Add the same information about the new test command to `claude.md`.