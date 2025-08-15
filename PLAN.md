
# PLAN: Implement Real-Time Log Streaming and Step Updates

## Goal

To fix the Live Activity page so that it streams log output in real-time and automatically updates the UI to reflect the currently running pipeline step as it changes.

## Description

Currently, the Live Activity page loads the correct initial state of a running task but never updates. The log output is static, and the "RUNNING STEP" display remains fixed on the step that was active when the page was loaded. This creates a confusing and misleading user experience.

This plan will fix the two underlying bugs:
1.  **On the backend,** we will implement a file watcher that actively monitors the log file being streamed and pushes new content to the client as it's written.
2.  **On the frontend,** we will refactor the WebSocket message handler to correctly process *all* types of real-time messages (log updates, task step changes, etc.) instead of ignoring them.

## Summary Checklist

-   [x] **1. Backend: Implement Real-Time Log File Watching:** In `src/tools/web.ts`, upgrade the WebSocket server to create a dedicated file watcher for each client that requests a log stream.
-   [x] **2. Frontend: Unify the WebSocket Message Handler:** In `src/public/js/live-activity.js`, refactor the code to use a single, comprehensive message handler that can process both log updates and task state changes.
-   [x] **3. Frontend: Implement DOM Updates for Step Changes:** Add the client-side JavaScript to update the UI (the sequence status and current step name) when a `task_update` message is received.

---

## Detailed Implementation Steps

### 1. Backend: Implement Real-Time Log File Watching

*   **Objective:** To have the server actively push log updates to the client instead of only sending the initial file content.
*   **Task:** Modify the `wss.on('connection', ...)` handler in `src/tools/web.ts`. We will store each client's log file watcher in a `Map` and ensure it's properly created on request and cleaned up on disconnect.

*   **Code Snippet (`src/tools/web.ts`):**

    ```typescript
    // At the top of startWebServer(), before the wss is created:
    const clientWatchers = new Map<WebSocket, chokidar.FSWatcher>();

    // ...

    // Replace the entire existing wss.on('connection', ...) block with this new version:
    wss.on('connection', (ws: WebSocket) => {
        console.log('WebSocket client connected');

        ws.on('message', (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'watch_log') {
                    const { taskId, logFile } = data;
                    if (!taskId || !logFile || typeof taskId !== "string" || typeof logFile !== "string") {
                        // ... error handling
                        return;
                    }
                    const filePath = path.join(logsDir, taskId, logFile);
                    // ... security checks

                    // Clean up any previous watcher for this client
                    if (clientWatchers.has(ws)) {
                        clientWatchers.get(ws)?.close();
                    }

                    if (fs.existsSync(filePath)) {
                        // Send initial content
                        const content = fs.readFileSync(filePath, 'utf-8');
                        ws.send(JSON.stringify({ type: 'log_content', content }));

                        // Create a new watcher for this file
                        const watcher = chokidar.watch(filePath, { persistent: true });
                        let lastSize = content.length;

                        watcher.on('change', (path) => {
                            const newContent = fs.readFileSync(path, 'utf-8');
                            if (newContent.length > lastSize) {
                                const chunk = newContent.substring(lastSize);
                                ws.send(JSON.stringify({ type: 'log_update', content: chunk }));
                                lastSize = newContent.length;
                            }
                        });
                        clientWatchers.set(ws, watcher);

                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Log file not found' }));
                    }
                }
            } catch (e) { /* ... error handling */ }
        });

        ws.on('close', () => {
            console.log('WebSocket client disconnected');
            // IMPORTANT: Clean up the watcher to prevent memory leaks
            if (clientWatchers.has(ws)) {
                clientWatchers.get(ws)?.close();
                clientWatchers.delete(ws);
            }
        });

        ws.on('error', (error) => console.error('WebSocket error:', error));
    });
    ```

### 2. Frontend: Unify the WebSocket Message Handler

*   **Objective:** To fix the bug where `task_update` messages were being ignored by creating a single message handler that understands all message types.
*   **Task:** In `src/public/js/live-activity.js`, we will refactor the logic so that `setupLogStream` no longer overwrites `onmessage`. Instead, we will use the main handler from `dashboard.js` and add the live-activity-specific logic to it.

*   **Code Snippets:**

    **A) In `src/public/js/dashboard.js`:**
    Make the main `handleRealtimeUpdate` function globally accessible from other scripts.

    ```javascript
    // In the ClaudeDashboard class constructor:
    this.globalOnMessage = this.handleRealtimeUpdate.bind(this);

    // In the initWebSocket method, change onmessage:
    this.websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            // Call the globally accessible handler
            this.globalOnMessage(data);
        } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
        }
    };
    ```

    **B) In `src/public/js/live-activity.js`:**
    Now, instead of overwriting `onmessage`, we will *extend* the global handler.

    ```javascript
    function initializeLiveActivity() {
        const runningTask = window.liveActivityData?.runningTask || null;
        const logContainer = document.getElementById('live-log-content');
        
        // Store the original handler
        const originalOnMessage = window.dashboard.globalOnMessage;

        // Create a new, combined message handler
        window.dashboard.globalOnMessage = (data) => {
            // First, let the original handler do its work (for task_update, etc.)
            originalOnMessage(data);

            // Now, add the logic specific to this page
            if (data.type === 'log_content') {
                logContainer.textContent = data.content;
                autoScrollToBottom();
            } else if (data.type === 'log_update') {
                logContainer.textContent += data.content;
                autoScrollToBottom();
            } else if (data.type === 'error') {
                logContainer.textContent += `\n\n[WebSocket Error] ${data.message}`;
            } else if (data.type === 'journal_updated') {
                if (document.querySelector('.empty-state')) {
                    window.location.reload();
                }
            }
        };

        if (!runningTask) {
            // No need for listenForNextTask anymore, the new handler covers it
            return;
        }
        
        // ... (rest of the function to request the initial log stream)
        const currentStep = runningTask.currentStep;
        const reasoningLog = runningTask.logs?.[currentStep]?.reasoning;
        if (reasoningLog) {
            // We just need to request the stream, the handler is already set up
            const watchMessage = { type: 'watch_log', taskId: runningTask.taskId, logFile: reasoningLog };
            // Small delay to ensure websocket is connected
            setTimeout(() => {
                 window.dashboard.websocket.send(JSON.stringify(watchMessage));
                 logContainer.textContent = 'Connecting to log stream...\n';
            }, 200);
        } else {
             logContainer.textContent = `Error: Could not find reasoning log for step: ${currentStep}`;
        }
    }

    // REMOVE the old setupLogStream and listenForNextTask functions entirely.
    ```

### 3. Frontend: Implement DOM Updates for Step Changes

*   **Objective:** To make the UI update when a `task_update` message arrives.
*   **Task:** This logic belongs in the main dashboard handler. Open `src/public/js/dashboard.js` and add the specific DOM update logic for the live activity page inside the `task_update` handler.

*   **Code Snippet (`src/public/js/dashboard.js`):**

    ```javascript
    // In the ClaudeDashboard class, inside the handleRealtimeUpdate method...
    
    handleRealtimeUpdate(data) {
        // ...
        if (data.type === 'task_update') {
            // ... (existing logic for other pages)
            
            // --- ADD THIS NEW LOGIC ---
            // If we are on the live activity page, update its elements
            if (window.location.pathname.endsWith('/live')) {
                const stepElement = document.querySelector('#running-step-name');
                if (stepElement && data.data.currentStep) {
                    stepElement.textContent = data.data.currentStep;
                }
                
                // Also reload if the task we were watching has finished
                const runningTask = window.liveActivityData?.runningTask;
                if(runningTask && runningTask.taskId === data.data.taskId && data.data.phase !== 'running') {
                    window.location.reload();
                }
            }
        } 
        // ...
    }
    ```    To make this work, we also need to add an ID to the element in the template.

    **In `src/templates/web/live-activity.ejs`:**
    ```html
    <p class="card-text text-primary mb-0">
        <strong>
            <i class="bi bi-arrow-repeat spinner-border spinner-border-sm me-1" role="status"></i>
            RUNNING STEP: <span id="running-step-name"><%= runningTask.currentStep %></span>
        </strong>
    </p>
    ```
