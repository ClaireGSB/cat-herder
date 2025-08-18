

# PLAN.MD: Complete the Vue 3 Frontend Implementation (with Component Inventory)

## Title & Goal

**Title:** Implement All UI Features for the Vue 3 Dashboard

**Goal:** To fully implement all the user-facing features from the original EJS dashboard into the new Vue 3 SPA, ensuring a feature-complete, real-time, and visually polished user experience.

---

## Description

The project has been successfully refactored to a monorepo structure with a new Vue 3 frontend application in `src/frontend`. The backend now serves a JSON API, and the frontend has a basic structure with views, routing, and a Pinia store.

However, the UI is currently a shell. It is missing critical features and the existing components are not yet wired together. This plan outlines the remaining implementation steps to build out the UI, wire the components to the Pinia store, and re-enable all real-time features, including live log streaming. The final result will be a fast, modern, and fully functional dashboard that surpasses the old version in both performance and usability.

Important: make sure to user the Playwright MCP to verify each step as you complete it. This will ensure that the implementation meets the requirements and is functional.

---

## Summary Checklist

-   [x] **0. Create  Test Data for Verification:** Create a set of test data in the backend to simulate sequences and tasks for verification.
-   [x] **1. Implement the History View:** Populate the main dashboard page with lists of recent sequences and standalone tasks by integrating existing components.
-   [ ] **2. Implement the Live Activity View:** Re-create the real-time monitoring page, including the live log viewer, by integrating and enhancing existing components.
-   [ ] **3. Implement the Task Detail View:** Build the page that displays all information for a single task, wiring up the interaction between the steps list and the log viewer.
-   [ ] **4. Implement the Sequence Detail View:** Build the page that displays all information for a sequence, including its list of associated tasks.
-   [ ] **5. Implement Global UI Components:** Add shared components like breadcrumb navigation and global error/loading states to unify the user experience.
-   [ ] **6. Update Project Documentation:** Update `ARCHITECTURE.MD` and `README.md` to reflect the completed and fully functional SPA.

---

## Detailed Implementation Steps

### 0. Create Test Data for Verification

Before starting the implementation, we must create a set of mock data. This is essential for the AI agent to visually verify its work using Playwright MCP. This data will simulate the state and log files that are normally generated when a user runs the tool.

**1. Create the Mock Data Directory Structure:**
*   Create a new directory at the project root: `test/mock-data/`.
*   Inside `test/mock-data/`, replicate the structure of a real `.claude` directory:
    ```
    test/mock-data/
    └── .claude/
        ├── state/
        └── logs/
    ```

**2. Create Mock State Files:**
*   **File:** `test/mock-data/.claude/state/task-completed-sample.state.json`
*   **Content:** This file simulates a successfully completed task. It **must include a `tokenUsage` object** so the `TokenUsageCard` can be tested.
    ```json
    {
      "version": 2,
      "taskId": "task-completed-sample",
      "taskPath": "claude-Tasks/completed-sample.md",
      "phase": "done",
      "currentStep": "review",
      "steps": { "plan": "done", "implement": "done", "review": "done" },
      "tokenUsage": {
        "claude-3-5-sonnet-20241022": {
          "inputTokens": 15000, "outputTokens": 4500,
          "cacheCreationInputTokens": 18000, "cacheReadInputTokens": 2000
        }
      },
      "stats": { "totalDuration": 123.45 },
      "lastUpdate": "2025-08-15T10:00:00Z"
    }
    ```
*   **File:** `test/mock-data/.claude/state/sequence-running-sample.state.json`
*   **Content:** This simulates a running sequence.
    ```json
    {
      "version": 1,
      "sequenceId": "sequence-running-sample",
      "phase": "running",
      "currentTaskPath": "claude-Tasks/feature-A/02-implement.md",
      "completedTasks": ["claude-Tasks/feature-A/01-plan.md"],
      "lastUpdate": "2025-08-15T11:00:00Z"
    }
    ```

**3. Create Mock Log Files:**
*   **Directory:** Create `test/mock-data/.claude/logs/task-completed-sample/`
*   **File:** `test/mock-data/.claude/logs/task-completed-sample/02-implement.reasoning.log`
*   **Content:** A simple text file to test the log viewer.
    ```log
    [ASSISTANT] Starting the implementation step.
    [TOOL_USE] Reading PLAN.md to understand the requirements.
    [TOOL_RESULT] Read file content successfully.
    [ASSISTANT] The plan is clear. I will now write the necessary code.
    ```

**4. Create a Script to Prepare the Mocks:**
*   Create a new script file: `tools/setup-mocks.sh`
*   **Content:** This script will be used in the verification loop.
    ```bash
    #!/bin/bash
    
    # 1. Remove any old mock data from the project root
    echo "Cleaning up old mock data..."
    rm -rf .claude
    
    # 2. Copy the fresh, consistent mock data to the root
    echo "Copying fresh mock data..."
    cp -r test/mock-data/.claude .
    
    echo "Mock data is ready."
    ```
*   Make the script executable: `chmod +x tools/setup-mocks.sh`

---

## The AI's Implementation & Verification Loop

To implement the plan, the agent will follow this repeatable script. This ensures a consistent environment for every Playwright check.

1.  **AI Action:** Make code changes to files in `src/frontend/`.
2.  **Run Verification Script:** Execute the following commands from the project root:

```bash
#!/bin/bash

# --- PREPARE THE ENVIRONMENT ---
echo "Step 1: Setting up mock data..."
./tools/setup-mocks.sh
if [ $? -ne 0 ]; then echo "Mock setup failed!"; exit 1; fi

# --- BUILD THE FRONTEND ---
echo "Step 2: Building the Vue application..."
npm run build --prefix src/frontend
if [ $? -ne 0 ]; then echo "Frontend build failed!"; exit 1; fi
echo "Build successful."

# --- RUN THE SERVER ---
echo "Step 3: Starting the web server in the background..."
claude-project web &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID. Waiting for it to initialize..."
sleep 3

# --- VERIFY THE UI ---
echo "Step 4: Running Playwright MCP to verify UI..."
# (Agent invokes Playwright MCP here, e.g., to view http://localhost:5177/task/task-completed-sample)

# --- CLEAN UP ---
echo "Step 5: Shutting down the web server..."
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
echo "Server stopped. Loop complete."
```

---

### 1. Implement the History View

*   **Objective:** To create a functional main dashboard page that serves as the primary entry point, displaying all past and current runs.
*   **File to Modify:** `src/frontend/src/views/HistoryView.vue`
*   **Existing Components to Use:**
    *   `SequenceCard.vue` (Path: `src/frontend/src/components/SequenceCard.vue`)
    *   `TaskCard.vue` (Path: `src/frontend/src/components/TaskCard.vue`)
*   **Component Layout:**
    1.  **Header:** A main title "Run History" (`<h1 class="text-h4">`).
    2.  **Live Activity Banner:** An alert (`<v-alert>`) that should only be visible if `taskStore.hasLiveActivity` is `true`. It should contain a link to the `/live` page.
    3.  **Sequences Section:**
        *   A sub-header "Recent Sequences" (`<h2 class="text-h5">`).
        *   A container (`<div>`) that uses `v-for` to loop through `taskStore.sequences` and renders an instance of the existing **`<SequenceCard>`** for each item.
        *   An empty state message inside a `<v-card>` if `taskStore.sequences` is empty.
    4.  **Standalone Tasks Section:**
        *   A sub-header "Recent Standalone Tasks" (`<h2 class="text-h5">`).
        *   A container (`<div>`) that uses `v-for` to loop through `taskStore.standaloneTasks` and renders an instance of the existing **`<TaskCard>`** for each item.
        *   An empty state message inside a `<v-card>` if `taskStore.standaloneTasks` is empty.
*   **Acceptance Criteria (for Playwright MCP):**
    *   When the page loads, it should display two sections: "Recent Sequences" and "Recent Standalone Tasks".
    *   Each sequence is rendered using a `SequenceCard` component.
    *   Each task is rendered using a `TaskCard` component.
    *   If a task is running, a "Live Activity Detected" banner is visible.

### 2. Implement the Live Activity View

*   **Objective:** To provide a real-time view of a running task, including streaming its logs directly to the user.
*   **File to Modify:** `src/frontend/src/views/LiveActivityView.vue`
*   **Existing Components to Use:**
    *   `PipelineSteps.vue` (Path: `src/frontend/src/components/PipelineSteps.vue`)
    *   `LogViewer.vue` (Path: `src/frontend/src/components/LogViewer.vue`)
    *   `StatusBadge.vue` (Path: `src/frontend/src/components/StatusBadge.vue`)
*   **Component Layout:**
    1.  **Header:** "Live Activity" title.
    2.  **Empty State (Conditional):** If `taskStore.hasLiveActivity` is `false`, display a large message "No Live Activity".
    3.  **Live Content (Conditional):** If `taskStore.hasLiveActivity` is `true`:
        *   **Task/Sequence Info:** A `<v-card>` displaying the details of the `taskStore.liveTask` (or `liveSequence`), including a **`<StatusBadge>`**.
        *   **Pipeline Progress:** An instance of the existing **`<PipelineSteps>`** component showing the status of each step for the `liveTask`.
        *   **Live Log Viewer:** An instance of the existing **`<LogViewer>`** component. This component needs to be modified to accept and display streaming text content from the WebSocket.
*   **Implementation Details:**
    *   Enhance the WebSocket service (`websocket.ts`) and the Pinia store (`taskStore.ts`) to handle real-time log content. The store should have a new state property, e.g., `liveLogContent: string`.
    *   Modify the **`<LogViewer>`** component to check if it's in "live" mode. If so, it should display the `taskStore.liveLogContent` instead of fetching a static log file.
*   **Acceptance Criteria (for Playwright MCP):**
    *   When a task is running, the page shows the task's details and its pipeline progress using the `PipelineSteps` component.
    *   The `LogViewer` component is visible and actively streaming text output from the current step's log. New text appears without the page reloading.
    *   When no task is running, the "No Live Activity" message is displayed.

### 3. Implement the Task Detail View

*   **Objective:** To build the comprehensive view for a single task, wiring up the interaction between components.
*   **File to Modify:** `src/frontend/src/views/TaskDetailView.vue`
*   **Existing Components to Use:**
    *   `BreadcrumbNav.vue` (Path: `src/frontend/src/components/BreadcrumbNav.vue`)
    *   `StatusBadge.vue` (Path: `src/frontend/src/components/StatusBadge.vue`)
    *   `PipelineSteps.vue` (Path: `src/frontend/src/components/PipelineSteps.vue`)
    *   `LogViewer.vue` (Path: `src/frontend/src/components/LogViewer.vue`)
    *   `TokenUsageCard.vue` (Path: `src/frontend/src/components/TokenUsageCard.vue`)
*   **Component Layout:**
    1.  **Navigation:** An instance of **`<BreadcrumbNav>`** at the top.
    2.  **Task Overview:** A main `<v-card>` showing the task's core details and an instance of **`<StatusBadge>`**.
    3.  **Pipeline Steps & Logs:**
        *   A `<v-card>` containing an instance of the existing **`<PipelineSteps>`** component.
        *   **This component must be modified** to render clickable buttons (`<v-btn>`) for each available log type on every step.
    4.  **Log Viewer:** An instance of the existing **`<LogViewer>`** component.
    5.  **Token Usage:** An instance of the existing **`<TokenUsageCard>`**, conditionally rendered with `v-if="task.tokenUsage"`.
*   **Implementation Details:**
    *   On mount, fetch data from `/api/task/:id`.
    *   Create a local `ref` called `selectedLog` in the view's script.
    *   The `<PipelineSteps>` component should emit an event when a log button is clicked. This view will listen for that event and update `selectedLog`.
    *   The `<LogViewer>` component will receive `selectedLog` as a prop, which will trigger it to fetch and display the correct log file.
*   **Acceptance Criteria (for Playwright MCP):**
    *   A list of pipeline steps is visible, rendered by `PipelineSteps`.
    *   Clicking the "Reasoning" button on a step loads the correct log content into the `LogViewer` component.
    *   The `TokenUsageCard` is visible for completed tasks.

### 4. Implement the Sequence Detail View

*   **Objective:** To build the detailed view for a sequence, including its list of associated tasks.
*   **File to Modify:** `src/frontend/src/views/SequenceDetailView.vue`
*   **Existing Components to Use:**
    *   `BreadcrumbNav.vue` (Path: `src/frontend/src/components/BreadcrumbNav.vue`)
    *   `StatusBadge.vue` (Path: `src/frontend/src/components/StatusBadge.vue`)
    *   `TaskCard.vue` (Path: `src/frontend/src/components/TaskCard.vue`)
    *   `TokenUsageCard.vue` (Path: `src/frontend/src/components/TokenUsageCard.vue`)
*   **Component Layout:**
    1.  **Navigation:** An instance of **`<BreadcrumbNav>`**.
    2.  **Sequence Overview:** A main `<v-card>` with the sequence's details, progress bar, and a **`<StatusBadge>`**.
    3.  **Task List:** A sub-header "Tasks in this Sequence" followed by a container that uses `v-for` to render an instance of the existing **`<TaskCard>`** for each task in the sequence.
    4.  **Token Usage:** An instance of the existing **`<TokenUsageCard>`** for the sequence's aggregated token usage.
*   **Acceptance Criteria (for Playwright MCP):**
    *   The page displays the details for the specified sequence.
    *   A list of individual `TaskCard` components is displayed, one for each task in the sequence.
    *   Clicking a task card navigates to that task's detail page.

### 5. Implement Global UI Components

*   **Objective:** To improve the overall application experience with shared, consistent UI elements.
*   **Files to Modify:** `App.vue`, `stores/taskStore.ts`.
*   **Existing Components to Use:**
    *   `BreadcrumbNav.vue` (Path: `src/frontend/src/components/BreadcrumbNav.vue`)
*   **Implementation Details:**
    1.  **Global Error Banner:** In `App.vue`, add a `<v-alert type="error">` at the top of the main content area, controlled by `v-if="taskStore.error"`.
    2.  **Loading Indicators:** Use `v-if="taskStore.isLoading"` in views like `HistoryView` to show a `<v-progress-linear indeterminate>` while fetching data.
    3.  **Breadcrumbs:** Ensure the **`<BreadcrumbNav>`** component is correctly integrated into the detail views and dynamically builds its items based on route params and fetched data.
*   **Acceptance Criteria (for Playwright MCP):**
    *   If an API call fails, a red error banner appears at the top of the page.
    *   When viewing a task that belongs to a sequence, the breadcrumb bar shows links for "History" and the parent sequence.

### 6. Update Project Documentation

*   **Objective:** To ensure the documentation reflects the completed architecture.
*   **File to Modify:** `ARCHITECTURE.MD` and `README.md`.
*   **Acceptance Criteria (for Playwright MCP):**
    *   The documentation correctly describes the final state of the project.