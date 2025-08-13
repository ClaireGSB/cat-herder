# PLAN.md

### **Title: Evolve Web UX into an Interactive Monitoring Dashboard**

**Goal:** Transform the basic web status page into a real-time, interactive dashboard for monitoring task/sequence progress and reviewing logs.

### **Description**

The current web UX (`claude-project web`) is a minimal, auto-refreshing HTML page that only shows the latest task's status. It lacks the ability to view historical runs, inspect logs, or see the real-time progress of a run without a full page reload.

This project will replace the existing page with a modern dashboard. The new UX will provide a comprehensive overview of all task and sequence runs, offer detailed views for each run (including pipeline steps, logs, and cost metrics), and use WebSockets for a seamless, real-time monitoring experience.

### **Summary Checklist**

-   [x] **1. Add Dependencies & Restructure Project**
-   [ ] **2. Implement Backend Server & Routes**
-   [ ] **3. Create Frontend EJS Templates**
-   [ ] **4. Integrate Real-Time Updates with WebSockets & Chokidar**
-   [ ] **5. Add Unit/Integration Tests for the Web Server**
-   [ ] **6. Update README.md Documentation**

---

### **Detailed Implementation Steps**

#### **1. Add Dependencies & Restructure Project**

*   **Objective:** Install the necessary libraries for the web server and create a new directory for web templates.
*   **Task:**
    1.  Add `ejs` and `ws` to the `devDependencies` in `package.json`. You already have `express` and `chokidar`.
    2.  Create a new directory: `src/templates/web/` to hold the EJS view templates.
    3.  Create a subdirectory for shared partials: `src/templates/web/partials/`.

*   **Code Snippet (`package.json`):**
    ```json
    "devDependencies": {
      // ... existing devDependencies
      "ejs": "^3.1.10",
      "ws": "^8.18.0",
      "@types/ws": "^8.5.10", // also add types for ws
      // ...
    }
    ```
    *After updating, run `npm install`.*

#### **2. Implement Backend Server & Routes**

*   **Objective:** Rearchitect `src/tools/web.ts` to serve a multi-page web application using Express and EJS.
*   **Task:**
    1.  Modify `startWebServer` in `src/tools/web.ts`.
    2.  Set EJS as the view engine for Express.
    3.  Create three main routes:
        *   `GET /`: The main dashboard page. It will read all files from the `.claude/state` directory, sort them by modification time, and pass the data to the `dashboard.ejs` template.
        *   `GET /task/:taskId`: The detail page for a single task. It will find the specific state file and its corresponding log directory. It will pass all relevant data (status, steps, logs, token usage) to a `task-detail.ejs` template.
        *   `GET /log/:taskId/:stepName`: An API-like route that reads and returns the content of a specific log file (`.log`, `.reasoning.log`) as plain text. This will be fetched by the frontend to display in the UI.
    4.  Create helper functions to abstract the logic of reading and parsing state/log files.

*   **Code Snippet (in `src/tools/web.ts`):**
    ```typescript
    import express from "express";
    import path from "path";
    import ejs from "ejs";
    // ... other imports

    export async function startWebServer() {
      // ...
      const app = express();
      const projectRoot = getProjectRoot();

      // Set view engine
      app.set("view engine", "ejs");
      app.set("views", path.resolve(new URL("../templates/web", import.meta.url).pathname));

      // Dashboard route
      app.get("/", (req, res) => {
        // Logic to read all state files...
        const tasks = getAllTaskStatuses(stateDir); // You'll write this helper
        res.render("dashboard", { tasks });
      });

      // Task detail route
      app.get("/task/:taskId", (req, res) => {
        const { taskId } = req.params;
        // Logic to get status and logs for one task...
        const taskDetails = getTaskDetails(stateDir, logsDir, taskId); // You'll write this
        if (!taskDetails) {
          return res.status(404).send("Task not found");
        }
        res.render("task-detail", { task: taskDetails });
      });

      // Route to get log content
      app.get("/log/:taskId/:logFile", (req, res) => {
          // Logic to read a specific log file and return its content
          // Sanitize logFile parameter to prevent directory traversal
      });

      app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
      });
    }
    ```

#### **3. Create Frontend EJS Templates**

*   **Objective:** Build the HTML views for the dashboard and detail pages using EJS templating.
*   **Task:**
    1.  Create `src/templates/web/partials/header.ejs` and `footer.ejs` to contain common HTML structure (head, body tags, etc.).
    2.  Create `src/templates/web/dashboard.ejs`. This file will loop through the `tasks` array passed from the server and render a table row for each task, with a link to its detail page.
    3.  Create `src/templates/web/task-detail.ejs`. This will display the detailed information for a single task:
        *   Header with Task ID, Status, Branch, and Stats.
        *   A list of pipeline steps. Each step should have a button to fetch and display its logs.
        *   A section to display token usage/cost metrics.
        *   A `<pre>` tag that will be populated with log content via JavaScript.

*   **Code Snippet (Example in `dashboard.ejs`):**
    ```html
    <%- include('partials/header') %>
    <h1>Claude Project Dashboard</h1>
    <table>
      <thead>
        <tr>
          <th>Task ID</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Last Update</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        <% tasks.forEach(task => { %>
          <tr>
            <td><%= task.taskId %></td>
            <td><span class="badge status-<%= task.phase %>"><%= task.phase %></span></td>
            <td><%= task.stats?.totalDuration.toFixed(2) ?? 'N/A' %>s</td>
            <td><%= new Date(task.lastUpdate).toLocaleString() %></td>
            <td><a href="/task/<%= task.taskId %>">View Details</a></td>
          </tr>
        <% }) %>
      </tbody>
    </table>
    <%- include('partials/footer') %>
    ```

#### **4. Integrate Real-Time Updates with WebSockets & Chokidar**

*   **Objective:** Push live status updates from the server to the browser without page reloads.
*   **Task:**
    1.  In `src/tools/web.ts`, integrate the `ws` library with your Express server.
    2.  Set up a `chokidar` watcher on the `.claude/state/` directory.
    3.  When a state file is changed, read the updated JSON and broadcast it to all connected WebSocket clients.
    4.  In a client-side `<script>` tag (e.g., in `footer.ejs`), write JavaScript to:
        *   Connect to the server's WebSocket endpoint (`/ws`).
        *   Listen for incoming messages.
        *   When a message is received, parse the JSON data and dynamically update the content of the dashboard (e.g., change a status badge, update a duration) using DOM manipulation.

#### **5. Add Unit/Integration Tests for the Web Server**

*   **Objective:** Ensure the new web server functionality is reliable and bug-free.
*   **Task:**
    1.  Create a new test file: `test/web.test.ts`.
    2.  Write tests for the server routes:
        *   Mock the filesystem to create fake state and log files.
        *   Start the server programmatically.
        *   Make HTTP requests to `GET /` and `GET /task/:taskId`.
        *   Assert that the server responds with a `200 OK` status.
        *   Assert that the rendered HTML contains the expected data from the mock files.

#### **6. Update README.md Documentation**

*   **Objective:** Document the new and improved web dashboard for users.
*   **Task:**
    1.  Navigate to the **Commands Reference -> CLI Commands** section in `README.md`.
    2.  Update the description for `claude-project web` from *"Starts a minimal web server to view task status."* to *"Starts an interactive web dashboard to monitor and debug task runs in real-time."*
    3.  Add a new, prominent section in the `README.md`, perhaps titled **"Interactive Web Dashboard"**.
    4.  In this new section, describe the features:
        *   Live monitoring of running tasks.
        *   Historical view of all runs.
        *   Detailed step-by-step progress.
        *   Integrated log viewer for debugging.
        *   Cost analysis with token usage metrics.
    5.  Include placeholders for screenshots of the new dashboard and detail views. `[Screenshot of the main dashboard]`

---

### **Error Handling & Warnings**

*   **Missing State/Log Files:** If a user tries to access a detail page for a task that doesn't exist, or if log files are missing, the server should respond with a clear `404 Not Found` page containing a user-friendly error message (e.g., "Task with ID 'xyz' could not be found.").
*   **Invalid JSON:** If a `.state.json` file is corrupted and cannot be parsed, the UI should gracefully handle it by showing an error for that specific task in the list instead of crashing the server. Log the error to the console for debugging.
*   **WebSocket Disconnection:** The client-side JavaScript should attempt to reconnect automatically if the WebSocket connection is lost.