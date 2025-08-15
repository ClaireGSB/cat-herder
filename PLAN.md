

# PLAN: Enhance Live Activity Page with Auto-Refresh and Last Task Context

## Goal

To improve the user experience of the Live Activity page by automatically refreshing into a live session when a new task begins, and by displaying the most recently completed task when nothing is active.

## Description

Currently, when no task is running, the Live Activity page shows a static "No Task is Currently Running" message. A user must manually refresh the page to see if a new task has started. Furthermore, this empty state provides no context about what just finished.

This plan outlines two key improvements:
1.  **Server-Push Auto-Refresh:** The server will watch for new task activity and push a notification to the browser, causing the page to automatically reload and display the new live task. This eliminates the need for manual polling.
2.  **Last Task Context:** When no task is active, the page will now display a summary of the most recently finished task (e.g., its ID and final status), providing immediate context and a link to its details.

## Summary Checklist

-   [x] **1. Backend: Find the Last Finished Task:** Create a new helper function in `src/tools/web.ts` to find the most recently completed task from the run journal.
-   [x] **2. Backend: Update the Live Activity Route:** Modify the `/live` route in `src/tools/web.ts` to use the new function and pass the last finished task's data to the UI when no task is active.
-   [ ] **3. Frontend: Display Last Finished Task:** Update the `live-activity.ejs` template to render the summary of the last finished task in the "empty state" view.
-   [ ] **4. Backend: Implement Journal Watcher:** Add a `chokidar` watcher in `src/tools/web.ts` to monitor `run-journal.json` for changes and broadcast a WebSocket message.
-   [ ] **5. Frontend: Implement Auto-Refresh:** Update the client-side `live-activity.js` to listen for the new WebSocket message and trigger a page reload if it's currently in the "no task running" state.

---

## Detailed Implementation Steps

### 1. Backend: Find the Last Finished Task

*   **Objective:** To create the logic that can identify the most recently completed task from the journal.
*   **Task:** In `src/tools/web.ts`, create a new helper function called `findLastFinishedTaskFromJournal`. This function will scan the journal backwards and return the first `task_finished` event it finds.

*   **Code Snippet (`src/tools/web.ts`):**

    ```typescript
    // Add this new helper function alongside findActiveTaskFromJournal

    /**
     * Finds the most recently finished task from the journal.
     */
    function findLastFinishedTaskFromJournal(journal: JournalEvent[]): JournalEvent | null {
      // Iterate backwards through the journal to find the newest event first.
      for (let i = journal.length - 1; i >= 0; i--) {
        const event = journal[i];
        if (event.eventType === 'task_finished') {
          return event; // Found the most recent finished task.
        }
      }
      return null; // No finished tasks in the journal.
    }
    ```

### 2. Backend: Update the Live Activity Route

*   **Objective:** To use the new helper function to provide data to the template when no task is running.
*   **Task:** In `src/tools/web.ts`, modify the `app.get("/live", ...)` route handler. If `findActiveTaskFromJournal` returns `null`, call `findLastFinishedTaskFromJournal` and pass its result to the template under a new variable, `lastFinishedTask`.

*   **Code Snippet (`src/tools/web.ts`):**

    ```typescript
    // Inside the app.get("/live", ...) handler

    app.get("/live", async (req: Request, res: Response) => {
      const journal = await readJournal();
      const activeTaskEvent = findActiveTaskFromJournal(journal);
      
      let taskDetails = null;
      let parentSequence = null;
      let lastFinishedTaskDetails = null; // New variable

      if (activeTaskEvent) {
        taskDetails = getTaskDetails(stateDir, logsDir, activeTaskEvent.id);
        parentSequence = activeTaskEvent.parentId 
          ? getSequenceDetails(stateDir, config, activeTaskEvent.parentId)
          : null;
      } else {
        // If no task is running, find the last one that finished.
        const lastFinishedTaskEvent = findLastFinishedTaskFromJournal(journal);
        if (lastFinishedTaskEvent) {
          lastFinishedTaskDetails = getTaskDetails(stateDir, logsDir, lastFinishedTaskEvent.id);
        }
      }
        
      res.render("live-activity", { 
        runningTask: taskDetails, 
        parentSequence: parentSequence,
        lastFinishedTask: lastFinishedTaskDetails, // Pass the new variable
        page: 'live-activity'
      });
    });
    ```

### 3. Frontend: Display Last Finished Task

*   **Objective:** To visually present the last completed task's summary on the live activity page.
*   **Task:** Modify `src/templates/web/live-activity.ejs`. Update the "No Running Task View" to check for the `lastFinishedTask` variable and display its information.

*   **Code Snippet (`src/templates/web/live-activity.ejs`):**

    ```html
    <!-- Inside the <% if (!runningTask) { %> block -->

    <div class="empty-state">
        <div class="text-center">
            <i class="bi bi-moon-stars display-1 text-muted mb-3"></i>
            <h3 class="text-muted mb-3">No Task is Currently Running</h3>
            
            <% if (lastFinishedTask) { %>
                <p class="text-muted">The last task to run has completed.</p>
                <div class="card d-inline-block p-3 bg-light" style="max-width: 600px; text-align: left;">
                    <h6 class="mb-1">Last Activity:</h6>
                    <p class="mb-1">
                        <strong>Task ID:</strong> <%= lastFinishedTask.taskId %>
                    </p>
                    <p class="mb-2">
                        <strong>Status:</strong> 
                        <span class="badge status-<%= lastFinishedTask.phase %>"><%= lastFinishedTask.phase %></span>
                    </p>
                    <a href="/task/<%= lastFinishedTask.taskId %>" class="btn btn-sm btn-outline-secondary">
                        View Details
                    </a>
                </div>
            <% } else { %>
                <p class="text-muted mb-4">
                    When a task starts, its live logs will appear here automatically.
                </p>
            <% } %>
        </div>
    </div>
    ```

### 4. Backend: Implement Journal Watcher

*   **Objective:** To enable the server to detect when a new task starts by watching the journal file.
*   **Task:** In `src/tools/web.ts`, inside the `startWebServer` function, add a new `chokidar` watcher that specifically monitors `run-journal.json`. When this file changes, broadcast a simple message to all connected WebSocket clients.

*   **Code Snippet (`src/tools/web.ts`):**

    ```typescript
    // Inside the startWebServer() function, after the existing stateWatcher

    const journalPath = path.join(stateDir, 'run-journal.json');
    const journalWatcher = chokidar.watch(journalPath, {
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
        ignoreInitial: true
    });

    journalWatcher.on('change', () => {
        console.log(`[Journal Watcher] Detected change in run-journal.json. Broadcasting update.`);
        const message = JSON.stringify({ type: 'journal_updated' });
        for (const ws of wss.clients) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        }
    });
    ```

### 5. Frontend: Implement Auto-Refresh

*   **Objective:** To make the browser reload the page automatically when it receives the `journal_updated` signal, but only if it's not already displaying a live task.
*   **Task:** In `src/public/js/live-activity.js`, enhance the WebSocket message handler to listen for the new event type.

*   **Code Snippet (`src/public/js/live-activity.js`):**

    ```javascript
    // At the top of listenForNextTask(currentTaskId), add this handler.
    // Or, if you have a central onmessage handler, add this case.

    // This should be part of the main websocket message handler
    window.dashboard.websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // --- HANDLE LOG STREAMING (for when a task IS running) ---
            if (data.type === 'log_content') { /* ... existing logic ... */ }
            if (data.type === 'log_update') { /* ... existing logic ... */ }
            if (data.type === 'error') { /* ... existing logic ... */ }

            // --- HANDLE AUTO-REFRESH (for when NO task is running) ---
            if (data.type === 'journal_updated') {
                // Only reload if we are currently on the "No Task Running" screen.
                // The "empty-state" div is a reliable indicator of this.
                if (document.querySelector('.empty-state')) {
                    console.log('New activity detected, reloading page...');
                    window.location.reload();
                }
            }

            // You can integrate the 'task_update' and 'sequence_update' logic from
            // listenForNextTask here as well to centralize the handler.

        } catch (e) {
            console.error('Error processing WebSocket message:', e);
        }
    };
    ```