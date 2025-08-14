

### **PLAN.md**


### **Title: Add a Real-Time "Live Activity" Log Stream**

**Goal:** Create a new dashboard view that streams the content of a running task's `reasoning.log` in real time, providing an "as-if-CLI" monitoring experience.

### **Summary Checklist**

-   [ ] **1. Enhance Backend for Live Log Tailing**
-   [ ] **2. Create a New "Live Activity" Page Template**
-   [ ] **3. Add Client-Side JavaScript for Log Streaming**
-   [ ] **4. Add New Routes and Navigation**
-   [ ] **5. Update README.md Documentation**

---

### **Detailed Implementation Steps**

#### **1. Enhance Backend for Live Log Tailing (`web.ts`)**

*   **Objective:** Modify the WebSocket server to handle subscriptions to specific log files and broadcast new content as it's written.
*   **Task:**
    1.  **Track Watched Files:** We need to know which client is watching which log. A `Map` is perfect for this. We also need to track the last known size of the file to only send new data.
        ```typescript
        // At the top of web.ts
        import { WebSocketServer, WebSocket } from 'ws';
        import chokidar from 'chokidar';

        const watchedLogs = new Map<WebSocket, { filePath: string; lastSize: number }>();
        ```
    2.  **Handle Subscription Messages:** When a client connects via WebSocket, it will send a message to subscribe to a log.
        ```typescript
        // Inside your WebSocket 'connection' handler
        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            if (data.type === 'watch_log') {
              const { taskId, logFile } = data;
              const filePath = path.join(logsDir, taskId, logFile);

              if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                watchedLogs.set(ws, { filePath, lastSize: stats.size });
                // Send initial full content
                ws.send(JSON.stringify({ type: 'log_content', content: fs.readFileSync(filePath, 'utf-8') }));
              }
            }
          } catch (e) { console.error('Error parsing WS message', e); }
        });
        ```
    3.  **Use Chokidar to Watch for Changes:** Set up a single `chokidar` watcher for the entire logs directory. When a file changes, check if any client is watching it.
        ```typescript
        // In startWebServer, after defining logsDir
        const watcher = chokidar.watch(logsDir, { persistent: true, awaitWriteFinish: true });

        watcher.on('change', (filePath) => {
          for (const [ws, watchInfo] of watchedLogs.entries()) {
            if (watchInfo.filePath === filePath && ws.readyState === WebSocket.OPEN) {
              const stats = fs.statSync(filePath);
              const newSize = stats.size;

              if (newSize > watchInfo.lastSize) {
                const stream = fs.createReadStream(filePath, {
                  start: watchInfo.lastSize,
                  end: newSize,
                  encoding: 'utf-8'
                });

                stream.on('data', (chunk) => {
                  ws.send(JSON.stringify({ type: 'log_update', content: chunk }));
                });

                watchInfo.lastSize = newSize; // Update the size
              }
            }
          }
        });
        ```
    4.  **Handle Disconnections:** Clean up the `watchedLogs` map when a client disconnects.
        ```typescript
        // Inside your WebSocket 'connection' handler
        ws.on('close', () => {
          watchedLogs.delete(ws);
        });
        ```

#### **2. Create a New "Live Activity" Page Template**

*   **Objective:** Create a dedicated EJS template for the live log stream view.
*   **Task:**
    1.  Create a new file: `src/templates/web/live-activity.ejs`.
    2.  This page will display details of the currently running task at the top (Task ID, Current Step).
    3.  Below the header, add a large, styled `<pre>` block that will serve as the terminal/log viewer.

*   **Code Snippet (`src/templates/web/live-activity.ejs`):**
    ```html
    <%- include('partials/header', { title: 'Live Activity' }) %>

    <div id="live-header" class="mb-3">
        <h1 class="h3">
            <i class="bi bi-broadcast-pin text-danger me-2"></i>Live Activity
        </h1>
        <div class="card bg-light border-0" id="task-info-card" style="display: none;">
            <div class="card-body">
                <h5 class="card-title mb-1" id="live-task-id"></h5>
                <p class="card-text text-muted mb-0">
                    Current Step: <strong id="live-task-step"></strong>
                </p>
            </div>
        </div>
        <p id="no-running-task" class="text-muted">No task is currently running. Start a task to see live logs.</p>
    </div>

    <div class="log-viewer" style="height: 60vh;">
        <pre id="live-log-content" class="log-content"></pre>
    </div>

    <%- include('partials/footer') %>
    ```

#### **3. Add Client-Side JavaScript for Log Streaming**

*   **Objective:** Write the JavaScript to connect to the WebSocket and handle the live log stream on the new page.
*   **Task:**
    1.  Add a new section to the `<script>` in `footer.ejs` that only runs on the `/live` page.
    2.  This script will find the *most recent running task* by fetching from the dashboard data.
    3.  It will then connect to the WebSocket and send the `watch_log` message for that task's reasoning log.
    4.  It will handle incoming `log_content` (for the initial load) and `log_update` (for new chunks) messages, appending the text to the `<pre>` tag and auto-scrolling to the bottom.

*   **Code Snippet (to be added inside the script tag in `footer.ejs`):**
    ```javascript
    document.addEventListener('DOMContentLoaded', function() {
        if (window.location.pathname === '/live') {
            const dashboard = window.dashboard;
            dashboard.initWebSocket(); // Ensure WebSocket is connected

            dashboard.websocket.onopen = () => {
                // Find the running task and subscribe to its log
                const runningTask = findRunningTask(); // You need to implement this
                if (runningTask && runningTask.taskId && runningTask.currentStep) {
                    document.getElementById('task-info-card').style.display = 'block';
                    document.getElementById('no-running-task').style.display = 'none';
                    document.getElementById('live-task-id').textContent = runningTask.taskId;
                    document.getElementById('live-task-step').textContent = runningTask.currentStep;

                    // Figure out the reasoning log file name
                    const stepLog = runningTask.logs[runningTask.currentStep];
                    if (stepLog && stepLog.reasoning) {
                         const message = {
                            type: 'watch_log',
                            taskId: runningTask.taskId,
                            logFile: stepLog.reasoning
                        };
                        dashboard.websocket.send(JSON.stringify(message));
                    }
                }
            };

            // Override the default onmessage handler for this page
            dashboard.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                const logContainer = document.getElementById('live-log-content');

                if (data.type === 'log_content' || data.type === 'log_update') {
                    logContainer.textContent += data.content;
                    // Auto-scroll to the bottom
                    logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
                }
            };
        }
    });

    // Helper to find running task (could be based on data embedded in the page or another API call)
    // This part needs the data from the dashboard page. We can pass it or fetch it.
    // For simplicity, let's assume we can fetch all tasks.
    async function findRunningTask() {
        // This is a simplified example; you'll need the task data from your backend.
        // Let's assume you have an API endpoint to get all tasks.
        const response = await fetch('/tasks'); // This endpoint needs to be created or data passed differently.
        const tasks = await response.json();
        return tasks.find(t => t.phase === 'running');
    }
    ```
    *Note: The `findRunningTask` logic is tricky. The easiest way is to modify the `GET /live` route in `web.ts` to find the running task and pass its data directly to the `live-activity.ejs` template.*

#### **4. Add New Routes and Navigation**

*   **Objective:** Make the new page accessible to the user.
*   **Task:**
    1.  **Add Navbar Link:** In `src/templates/web/partials/header.ejs`, add a link to the new "Live Activity" page in the navbar.
        ```html
        <!-- In header.ejs inside the navbar -->
        <a class="nav-link" href="/live" title="Live Activity">
            <i class="bi bi-broadcast"></i>
            Live Activity
        </a>
        ```
    2.  **Create Server Route:** In `src/tools/web.ts`, add the route to render the new EJS template. This route should find the currently running task and pass its details to the template.
        ```typescript
        // In web.ts
        app.get("/live", (req: Request, res: Response) => {
          const allTasks = getAllTaskStatuses(stateDir);
          const runningTask = allTasks.find(t => t.phase === 'running');
          // Fetch full details for the running task to get log file names
          const taskDetails = runningTask ? getTaskDetails(stateDir, logsDir, runningTask.taskId) : null;
          res.render("live-activity", { runningTask: taskDetails });
        });
        ```    3.  **Update the client-side `findRunningTask` logic** to use the data embedded in the EJS template instead of making another fetch.

#### **5. Update README.md Documentation**

*   **Objective:** Document the powerful new live monitoring feature.
*   **Task:**
    1.  In the "Interactive Web Dashboard" section of `README.md`, add a new bullet point describing the "Live Activity" view.
    2.  Explain what it's for: "See a real-time stream of Claude's reasoning process, just like watching a terminal, perfect for monitoring active tasks."
    3.  Add a placeholder for a screenshot of the new live view page: `[Screenshot of the Live Activity stream]`.