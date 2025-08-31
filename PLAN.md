
# PLAN: Display Future and Dynamic Tasks/Steps on Live Activity Page

**Goal:** Modify the web dashboard's "Live Activity" page to display all upcoming tasks in a sequence (including dynamically generated ones), all future steps in a task, and correctly reflect the status when a task is resumed from an interrupted state.

## Description

Currently, the Live Activity page has three visibility gaps that impact the user experience:
1.  **Incomplete View:** It only shows tasks and steps for which a `.state.json` file already exists. This means users cannot see what is coming next in the queue.
2.  **No Dynamic Updates:** It does not update to show new tasks that are dynamically created by a preceding task in a sequence.
3.  **Resume Bug:** It fails to update a task's status from `interrupted` back to `running` when a task is resumed, leaving the UI in a stale, static state.

This plan will fix all three issues by making the filesystem and configuration the primary "source of truth" and by improving the client-side refresh logic.

The new behavior will be:
1.  **Complete View:** The page will read the filesystem (`.md` files in the task folder) and the project configuration (`cat-herder.config.js`) to show all tasks and steps from the start, marking any un-started items as "pending".
2.  **Dynamic Discovery:** The page will automatically reload after a task completes, forcing a re-scan of the task directory to discover and display any newly created task files.
3.  **Resume-Aware:** The page will automatically reload when a task transitions from a terminal state (`interrupted`, `failed`) back to `running`, ensuring the UI correctly re-initializes into its "live" mode.

## Summary Checklist

-   [x] **Backend:** Update the `getSequenceDetails` function to read all tasks from the filesystem.
-   [x] **Backend:** Update the `/live` route handler to build a complete list of steps from the configuration.
-   [x] **Frontend:** Update the `_live-task-steps.ejs` template to handle the new ordered step data.
-   [x] **Client-Side:** Refactor the WebSocket logic in `dashboard.js` to handle all page reload scenarios, including task completion and task resumption.
-   [x] **Documentation:** Update `ARCHITECTURE.MD` to reflect the new data-fetching and client-side strategies.

## Detailed Implementation Steps

### 1. Update Data Access for Sequence Tasks

*   **Objective:** Modify the `getSequenceDetails` function to show all tasks in a sequence, including those that have not yet started.
*   **Task:**
    1.  Navigate to `src/tools/web/data-access.ts`.
    2.  Locate the `getSequenceDetails` function. The function currently gets task info by iterating over existing state files. This logic needs to be replaced.
    3.  The function should first determine the sequence's task folder path. You can derive this from the `sequenceId` (e.g., `sequence-my-feature` -> `my-feature`) and the `taskFolder` property from the `config` object passed into the function.
    4.  Use `fs.readdirSync` to get a list of all `.md` files in that folder. Filter out any files that start with an underscore (`_`). This list is the authoritative source of all tasks for the sequence.
    5.  Iterate over this list of filenames. For each file:
        *   Construct its full path.
        *   Generate its `taskId` using the existing `taskPathToTaskId` utility function (you may need to import it and pass the project root).
        *   Check if a state file (`<taskId>.state.json`) exists in `stateDir`.
        *   If the state file exists, read its status (`phase`).
        *   If it does not exist, assign the status `'pending'`.
    6.  Build the `sequenceDetails.tasks` array from this complete list, ensuring it's sorted alphabetically by filename to maintain the correct execution order.

### 2. Update Route Handler for Task Steps

*   **Objective:** Modify the `/live` route to provide a complete, ordered list of all pipeline steps for the current task.
*   **Task:**
    1.  Navigate to `src/tools/web/routes.ts`.
    2.  Locate the `router.get("/live", ...)` route handler.
    3.  Inside the handler, after the `taskToShow` object is fetched, check if it exists and has a `pipeline` name associated with it.
    4.  Access the `pipelines` object from the `config` variable already available in the router.
    5.  Get the authoritative list of step configurations from `config.pipelines[taskToShow.pipeline]`. This array defines the correct order and names of all steps.
    6.  Create a new `steps` object. Iterate through the authoritative step list from the config. For each `stepConfig` in the list, use its `name` as the key and look up its status in the original `taskToShow.steps` object. If a status exists, use it; otherwise, default to `'pending'`.
    7.  Replace the original `taskToShow.steps` with this new, complete, and ordered `steps` object before passing `taskToShow` to the `res.render` call.

*   **Code Snippet (Conceptual Change in `/live` route):**

    ```typescript
    // Inside the /live route, after fetching taskToShow...
    if (taskToShow && taskToShow.pipeline && config.pipelines) {
        const pipelineName = taskToShow.pipeline;
        const pipelineSteps = config.pipelines[pipelineName]; // Array of step objects from config

        if (pipelineSteps) {
            const completeSteps: { [key: string]: string } = {};
            // Iterate over the config to enforce order
            for (const stepConfig of pipelineSteps) {
                const stepName = stepConfig.name;
                // Get existing status from the state file, or default to 'pending'
                completeSteps[stepName] = taskToShow.steps[stepName] || 'pending';
            }
            taskToShow.steps = completeSteps; // Replace the original unordered steps object
        }
    }
    // Now pass the modified taskToShow to the template
    res.render("live-activity", { /* ... */ });
    ```

### 3. Update the Task Steps Template

*   **Objective:** Ensure the UI correctly displays the new ordered list of steps.
*   **Task:**
    1.  Navigate to `src/templates/web/partials/_live-task-steps.ejs`.
    2.  The current logic `Object.entries(taskToShow.steps).forEach(...)` will now iterate over the steps in the order they were inserted by the backend logic in Step 2, which is the correct pipeline order. No direct change to the iteration is needed, but verify it works as expected.
    3.  Check the `src/templates/web/partials/_status-badge.ejs` partial to confirm it has a style for the `'pending'` status (e.g., a grey badge with a clock icon). If not, add it.

### 4. Refactor Client-Side Refresh Logic

*   **Objective:** Fix the task resume bug and implement dynamic task discovery by triggering a page reload at the correct times.
*   **Task:**
    1.  Navigate to `src/public/js/dashboard.js`.
    2.  Add a `currentTaskPhase` property to the `CatHerderDashboard` class to track the state of the task currently being viewed on the live page.
        ```javascript
        class CatHerderDashboard {
            constructor() {
                //...
                this.currentTaskPhase = null;
            }
            //...
        }
        ```
    3.  In the `initializeLiveView(runningTask)` function, set the initial value of this property.
        ```javascript
        initializeLiveView(runningTask) {
            if (!runningTask) return;
            this.currentTaskPhase = runningTask.phase;
            //...
        }
        ```
    4.  Refactor the `handleRealtimeUpdate` function's `'task_update'` case with the following ordered logic to handle all reload scenarios:
        a.  Store the old phase and get the new phase from the incoming WebSocket message.
        b.  Check if the user is on the `/live` page. If not, do nothing further that reloads the page.
        c.  **First, check for the "resume" scenario:** If the old phase was `interrupted` or `failed` and the new phase is `running`, trigger an immediate `window.location.reload()`. This is the highest priority check.
        d.  **Second, check for the "dynamic task discovery" scenario:** If the page is displaying a sequence, and a task within that sequence has just entered a terminal state (`done`, `failed`, `interrupted`), trigger a `window.location.reload()` after a 1-second delay.

*   **Code Snippet (Conceptual Change in `dashboard.js`):**

    ```javascript
    // In dashboard.js -> handleRealtimeUpdate -> case 'task_update':
    const oldTaskPhase = this.currentTaskPhase;
    const newTaskPhase = data.data.phase;
    this.currentTaskPhase = newTaskPhase; // Always update state

    if (window.location.pathname.endsWith('/live')) {
        // SCENARIO 1: A task has been resumed. Reload to enter 'live' mode. (BUG FIX)
        if ((oldTaskPhase === 'interrupted' || oldTaskPhase === 'failed') && newTaskPhase === 'running') {
            console.log(`Task ${data.data.taskId} has resumed. Reloading page.`);
            window.location.reload();
            return; // Exit to allow reload
        }

        // SCENARIO 2: A task in a sequence finished. Reload to find new tasks. (DYNAMIC DISCOVERY)
        const currentSequence = window.liveActivityData?.parentSequence;
        const updatedTask = data.data;
        if (currentSequence && updatedTask.parentSequenceId === currentSequence.sequenceId &&
            ['done', 'failed', 'interrupted'].includes(newTaskPhase) && oldTaskPhase === 'running') {
            
            console.log(`Task ${updatedTask.taskId} finished. Reloading sequence view.`);
            setTimeout(() => window.location.reload(), 1200); // Delay to ensure state is written
            return; // Exit to allow reload
        }
    }
    // If no reload was triggered, proceed with normal UI updates (e.g., status badges)
    this.updateTaskUI(data.data);
    ```

## Error Handling & Warnings

*   **Missing Task Folder:** If `getSequenceDetails` cannot find the task folder for a sequence on the filesystem, it should log a warning to the server console and return an empty `tasks` array. The UI should gracefully display a "No tasks found" message.
*   **Invalid Pipeline Name:** If the `/live` route handler cannot find the pipeline specified in a task's state within `cat-herder.config.js`, it should log an error to the server console and fall back to displaying only the steps that are present in the state file, preserving the old behavior for that edge case.

## Documentation Changes

*   **`ARCHITECTURE.MD`**: In the "Interface Layer (CLI & Web)" section, update the description of the Web Dashboard. Explain that it now uses the filesystem (`.md` files) and `cat-herder.config.js` as the primary sources of truth to display the complete workflow for sequences and tasks. Mention that it enriches this view with status information from the State Layer. Also, add a note about the client-side WebSocket logic that triggers page reloads to handle state transitions (like resuming a task) and to discover dynamically generated tasks in near real-time.