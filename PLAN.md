

# PLAN: Frontend Template Refactor (V1)

## Title & Goal

**Title:** Frontend EJS Template Refactor into Reusable Partials
**Goal:** To improve the maintainability and organization of the web dashboard's frontend code by breaking large EJS template files into smaller, reusable partials.

## Description

The current web dashboard templates (e.g., `task-detail.ejs`, `live-activity.ejs`) have grown large and contain a mix of page layout, data display, and UI components in single files. This makes them difficult to read, modify, and maintain.

This refactor will extract common and complex UI sections into their own dedicated "partial" EJS files. The main page templates will then include these partials, resulting in a cleaner, more component-based structure. **This is a purely structural refactor; there should be no change to the UI's appearance or functionality.**

## Summary Checklist

-   [x] Create new EJS partials for reusable UI components.
-   [x] Refactor `task-detail.ejs` to use the new partials.
-   [x] Refactor `sequence-detail.ejs` to use the new partials.
-   [ ] Refactor `live-activity.ejs` to use the new partials.
-   [ ] Manually test the web dashboard to ensure no visual or functional regressions.
-   [ ] Update `ARCHITECTURE.MD` to reflect the improved frontend structure.

## Detailed Implementation Steps

### 1. Create New EJS Partials

*   **Objective:** To create the individual, reusable template files for common UI components.
*   **Task:** In the `src/templates/web/partials/` directory, create the following new files. We will use a leading underscore `_` to denote that these are partials intended for inclusion.

    1.  `_log-viewer.ejs`: This will contain the log viewer window, including the header and the `<pre>` tag for content.
    2.  `_task-steps.ejs`: This will contain the list of pipeline steps for a single task.
    3.  `_sequence-task-list.ejs`: This will contain the list of tasks belonging to a sequence.
    4.  `_token-usage.ejs`: This will contain the card that displays token usage statistics for a task or sequence.

### 2. Refactor `task-detail.ejs`

*   **Objective:** To simplify the `task-detail.ejs` template by replacing large blocks of HTML with includes for the new partials.
*   **Task:**
    1.  Open `src/templates/web/task-detail.ejs`.
    2.  Locate the HTML block for the **Log Viewer**. Cut this entire block and paste it into the new `_log-viewer.ejs` file.
    3.  Locate the HTML block for the **Token Usage**. Cut this block and paste it into the new `_token-usage.ejs` file.
    4.  In `task-detail.ejs`, replace the removed blocks with `<%- include(...) %>` calls, passing the necessary data.

*   **Code Snippet (Log Viewer):**

    **Before:**
    ```ejs
    <!-- In task-detail.ejs -->
    <div class="row mb-4">
        <div class="col-12">
            <div class="card">
                <div class="card-header bg-transparent d-flex justify-content-between align-items-center">
                    <!-- ... card header content ... -->
                </div>
                <div class="card-body p-0">
                    <div class="log-viewer" id="log-content">
                        <!-- ... initial content ... -->
                    </div>
                </div>
            </div>
        </div>
    </div>
    ```

    **After:**
    ```ejs
    <!-- In task-detail.ejs -->
    <%- include('partials/_log-viewer') %>
    ```

*   **Code Snippet (Token Usage):**

    **Before:**
    ```ejs
    <!-- In task-detail.ejs -->
    <div class="row mb-4">
        <div class="col-12">
            <div class="card">
                <!-- ... Entire Token Usage card ... -->
            </div>
        </div>
    </div>
    ```

    **After:**
    ```ejs
    <!-- In task-detail.ejs -->
    <%- include('partials/_token-usage', { tokenUsage: task.tokenUsage, helpers: helpers }) %>
    ```

### 3. Refactor `sequence-detail.ejs`

*   **Objective:** To simplify the `sequence-detail.ejs` template.
*   **Task:**
    1.  Open `src/templates/web/sequence-detail.ejs`.
    2.  Replace the "Total Token Usage" card with an include for the `_token-usage.ejs` partial.
    3.  Cut the task list logic (the `forEach` loop over `sequence.tasks`) and move it into `_sequence-task-list.ejs`.
    4.  Replace the removed block with an include for the new partial.

*   **Code Snippet (Token Usage):**

    ```ejs
    <!-- In sequence-detail.ejs -->
    <%- include('partials/_token-usage', { tokenUsage: sequence.stats.totalTokenUsage, helpers: helpers }) %>
    ```

### 4. Refactor `live-activity.ejs`

*   **Objective:** To simplify the most complex page, `live-activity.ejs`, using multiple partials.
*   **Task:**
    1.  Open `src/templates/web/live-activity.ejs`.
    2.  Replace the "Sequence Tasks" panel with an include for `_sequence-task-list.ejs`. You will pass `parentSequence.tasks` to it.
    3.  Replace the "Task Steps" panel with an include for `_task-steps.ejs`. You will pass `taskToShow` to it.
    4.  Replace the "Log Viewer" `<div>` with an include for `_log-viewer.ejs`.

*   **Code Snippet (Example - Task Steps):**

    **Before:**
    ```ejs
    <!-- In live-activity.ejs -->
    <div class="card">
        <div class="card-header">
             <h6 class="mb-0"><i class="bi bi-list-ol me-2"></i>Task Steps</h6>
        </div>
        <ul class="list-group list-group-flush">
             <% if (taskToShow.steps && Object.keys(taskToShow.steps).length > 0) { %>
                <!-- ... forEach loop over steps ... -->
            <% } else { %>
                 <li class="list-group-item text-muted">Steps not yet started.</li>
            <% } %>
        </ul>
    </div>
    ```

    **After:**
    ```ejs
    <!-- In live-activity.ejs -->
    <%- include('partials/_task-steps', { task: taskToShow }) %>
    ```

### 5. Manual Testing

*   **Objective:** To confirm that the refactor did not introduce any bugs or visual changes.
*   **Task:**
    1.  Start the web server using `npm run cat-herder:web`.
    2.  Navigate to the dashboard at `http://localhost:5177`.
    3.  Click through all pages:
        *   Live Activity (`/live`)
        *   Run History (`/history`)
        *   A Sequence Detail page
        *   A Task Detail page
    4.  Verify that all UI elements appear correctly and that data is displayed as it was before the refactor.
    5.  On the Task Detail page, confirm that clicking the log buttons still loads the log content correctly into the viewer.

## Documentation Changes

### Update ARCHITECTURE.MD

*   **Objective:** To ensure our architectural documentation reflects the current state of the codebase.
*   **Task:** The principle of "Maintain Small, Focused Modules" is already in the document, which is great. We just need to add a small note to explicitly mention how this applies to the frontend.

    1.  Open `ARCHITECTURE.MD`.
    2.  Navigate to section `2. Core Architectural Concepts` -> `A. Separation of Concerns` -> `1. Interface Layer (CLI & Web)`.
    3.  Find the bullet point for **Web Dashboard**.
    4.  Add a sentence to clarify the template structure.

*   **Code Snippet:**

    **Current Text:**
    > *   **Web Dashboard (`src/tools/web/`):** An optional monitoring layer. It runs as a separate process and reads from the State Layer to provide a real-time view of the workflow.

    **Proposed New Text:**
    > *   **Web Dashboard (`src/tools/web/`):** An optional monitoring layer that runs as a separate process and reads from the State Layer to provide a real-time view of the workflow. Its frontend is built using EJS, with larger pages composed from smaller, reusable partials (e.g., `_log-viewer.ejs`, `_task-steps.ejs`) to maintain a clean and component-based structure.