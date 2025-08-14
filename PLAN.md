
# PLAN.md

### **Title: Enhance Web Dashboard with Real-Time State Updates and Sequence Monitoring**

**Goal:** Evolve the web dashboard into a fully real-time monitoring tool by implementing global state updates for both tasks *and sequences*, and adding a dedicated dashboard for monitoring multi-task sequences.

### **Summary Checklist**

-   [ ] **1. Implement Real-Time State Updates for Tasks & Sequences**
-   [ ] **2. Enhance Live Activity Page with Full Lifecycle Awareness**
-   [ ] **3. Add Contextual Link from Task Detail to Live View**
-   [ ] **4. Create Backend API for Sequences**
-   [ ] **5. Implement Frontend Views for Sequence Dashboard**
-   [ ] **6. Add Real-Time Updates to Sequence Views**
-   [ ] **7. Update README.md Documentation**

---

### **Detailed Implementation Steps**

#### **1. Implement Real-Time State Updates for Tasks & Sequences (Revised)**

*   **Objective:** Make the server watch for changes in **both** task and sequence state files and broadcast appropriately typed updates, making the entire application aware of the full workflow state.

*   **Task (Backend - `src/tools/web.ts`):**
    1.  Use a single `chokidar` watcher for the entire `stateDir`.
    2.  Modify the `handleStateChange(filePath)` function to be smarter. It needs to check the filename to determine if the update is for a single task or a sequence.
    3.  If the file is `task-....state.json`, broadcast a `{ type: 'task_update', ... }` message.
    4.  If the file is `sequence-....state.json`, broadcast a **new message type**: `{ type: 'sequence_update', data: sequenceStatus }`. This is the key change.

*   **Code Snippet (Backend - `src/tools/web.ts`):**
    ```typescript
    // Revised handleStateChange function
    const handleStateChange = (filePath: string) => {
        if (!filePath.endsWith('.state.json')) return;

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const stateData = JSON.parse(content);
            let messageType;

            if (path.basename(filePath).startsWith('sequence-')) {
                messageType = 'sequence_update';
            } else {
                messageType = 'task_update';
            }

            // Broadcast the update to all connected clients with the correct type
            for (const ws of wss.clients) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: messageType, data: stateData }));
                }
            }
        } catch (e) {
            console.error(`[State Watcher] Failed to process state change for ${filePath}`, e);
        }
    };

    const stateWatcher = chokidar.watch(path.join(stateDir, '*.state.json'), { persistent: true });
    stateWatcher.on('add', handleStateChange).on('change', handleStateChange);
    ```

#### **2. Enhance Live Activity Page with Full Lifecycle Awareness (Revised)**

*   **Objective:** Make the `/live` page aware of the sequence context, allowing it to display sequence completion status in addition to task status.

*   **Task (Backend - `src/tools/web.ts`):**
    1.  When rendering the `/live` route, the server logic must not only find the running task but also determine if it's part of a sequence.
    2.  You can infer the `sequenceId` from the task's folder structure or by finding a sequence state file that lists the running task.
    3.  Pass both the `runningTask` and the `parentSequence` (if it exists) to the `live-activity.ejs` template.

*   **Task (Frontend - `live-activity.ejs` & `footer.ejs`):**
    1.  The `live-activity.ejs` template should now display the parent sequence ID if it exists (e.g., "Monitoring Sequence: `sequence-my-feature`").
    2.  Add a separate, hidden banner for "Sequence Complete".
    3.  The client-side JavaScript for the live page must now listen for both `task_update` and `sequence_update` messages.
    4.  When a `sequence_update` message is received for the parent sequence, and its `phase` is `done` or `failed`, display the "Sequence Complete" banner with a link to the sequence detail page. This provides a more definitive and satisfying conclusion for the user.

*   **Code Snippet (Frontend - update `initLiveActivityWebSocket` in `footer.ejs`):**
    ```javascript
    // This logic now needs to be aware of the parent sequence
    const runningTaskData = <%- typeof runningTask !== 'undefined' && runningTask ? JSON.stringify(runningTask) : 'null' %>;
    const parentSequenceData = <%- typeof parentSequence !== 'undefined' && parentSequence ? JSON.stringify(parentSequence) : 'null' %>;

    // ... inside the setupLiveActivityHandlers function ...
    window.dashboard.websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const logContainer = document.getElementById('live-log-content');

        if (data.type === 'log_content' || data.type === 'log_update') {
            // ... same as before ...
        } else if (data.type === 'task_update' && data.data.taskId === runningTaskData.taskId) {
            // ... same as before, update the step name, show task finished banner ...
        } else if (parentSequenceData && data.type === 'sequence_update' && data.data.sequenceId === parentSequenceData.sequenceId) {
            // NEW: Handle sequence completion
            if (data.data.phase !== 'running') {
                logContainer.textContent += `\n\n--- SEQUENCE FINISHED with status: ${data.data.phase} ---`;
                autoScrollToBottom();

                // Show a more prominent "Sequence Finished" banner
                const seqBanner = document.getElementById('sequence-finished-banner'); // A new banner
                const seqDetailsLink = document.getElementById('view-sequence-details-link');
                seqDetailsLink.href = `/sequence/${parentSequenceData.sequenceId}`;
                seqBanner.style.display = 'block';

                // Hide the individual task finished banner if it's showing
                document.getElementById('task-finished-banner').style.display = 'none';
            }
        }
    };
    ```

#### **3. Add Contextual Link from Task Detail to Live View**

*   **Objective:** Provide an easy and intuitive way for users to jump from a running task's detail page directly to the live log stream.

*   **Task (`src/templates/web/task-detail.ejs`):**
    1.  In the pipeline steps loop, add an EJS conditional to check if the `task.phase` is `"running"` and the current `step.status` is also `"running"`.
    2.  If both are true, render a styled link or badge next to the step name that points to the `/live` page.

*   **Code Snippet (`src/templates/web/task-detail.ejs`):**
    ```html
    <!-- Inside the forEach loop for task.steps -->
    <h6 class="mb-1">
        <span class="badge bg-light text-dark me-2"><%= index + 1 %></span>
        <%= step.name %>
        
        <!-- ... existing status icons ... -->

        <% if (task.phase === 'running' && step.status === 'running') { %>
            <a href="/live" class="ms-2 badge bg-danger text-decoration-none" title="View Live Activity">
                <i class="bi bi-broadcast me-1"></i>LIVE
            </a>
        <% } %>
    </h6>
    ```

#### **4. Create Backend API for Sequences**

*   **Objective:** Build the necessary server-side logic and API endpoints to aggregate and serve detailed data about all task sequences.

*   **Task (Backend - `src/tools/web.ts`):**
    1.  **Create a `getSequenceDetails(sequenceId)` helper function.** This is the core logic. It will:
        *   Read the main `sequence-....state.json` file for overall status, branch, and stats.
        *   Scan the corresponding task folder (e.g., `claude-Tasks/my-feature`) to get a complete list of all `.md` task files (ignoring files starting with `_`).
        *   For each task file, derive its `taskId` and attempt to read its corresponding `task-....state.json`.
        *   Compile a list of all tasks in the sequence, including their individual statuses (e.g., `done`, `running`, `failed`, or `pending` if no state file exists).
        *   Return a single, rich JSON object containing the sequence's overall status and the detailed list of its child tasks.
    2.  **Create a `getAllSequenceStatuses()` helper function.** This will scan the `stateDir` for all `sequence-*.state.json` files and return a summary list for the main dashboard.
    3.  **Create new API endpoints:**
        *   `GET /api/sequences`: Uses `getAllSequenceStatuses` to return a JSON list of all sequences.
        *   `GET /api/sequences/:sequenceId`: Uses `getSequenceDetails` to return the detailed JSON object for a single sequence.

#### **5. Implement Frontend Views for Sequence Dashboard**

*   **Objective:** Build the user interface for listing and viewing the details of task sequences.

*   **Task (Frontend - EJS Templates):**
    1.  **Add Navbar Link:** In `src/templates/web/partials/header.ejs`, add a new navigation link for "Sequences" that points to `/sequences`.
    2.  **Create `sequences-dashboard.ejs`:** This new template will be served by a `GET /sequences` route. It will:
        *   Fetch data from `/api/sequences`.
        *   Display a table listing all sequences with their ID, overall status, total tasks, duration, and a link to the detail view.
    3.  **Create `sequence-detail.ejs`:** This new template will be served by a `GET /sequence/:sequenceId` route. It will:
        *   Display the overall sequence information (status, branch, stats) in a header card.
        *   Render a list of all tasks belonging to the sequence.
        *   Each task in the list should clearly show its own status (`done`, `running`, `failed`, `pending`) with a colored badge.
        *   The currently running task should be visually highlighted.
        *   Each task should have a link to its own detailed task view (`/task/:taskId`).

*   **Task (Backend - `src/tools/web.ts`):**
    1.  Add the Express routes to render the new EJS templates:
        *   `GET /sequences`: Renders `sequences-dashboard.ejs`.
        *   `GET /sequence/:sequenceId`: Renders `sequence-detail.ejs`, passing in the data from your `getSequenceDetails` helper.

#### **6. Add Real-Time Updates to Sequence Views**

*   **Task (Frontend - `footer.ejs`):**
    1.  On the sequence list and detail pages, listen for `sequence_update` messages.
    2.  Update the status, duration, and other metrics on the page dynamically when a relevant update is received. This makes the entire sequence section fully real-time.

#### **7. Update README.md Documentation**

*   **Objective:** Document the new, fully real-time capabilities and the Sequence Dashboard.
*   **Task (`README.md`):**
    1.  Update the "Interactive Web Dashboard" section to reflect that the system is fully real-time for both tasks and sequences.
    2.  Create the new "Sequence Monitoring" subsection as planned.
    3.  In the "Live Activity Stream" description, explicitly state that it now shows when an entire sequence is complete, providing a clear end-to-end monitoring experience.