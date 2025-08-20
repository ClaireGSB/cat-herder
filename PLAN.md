

# PLAN V2: Implement UI-Based Interactive Halting

### **Goal**

To enable users to answer the AI's clarifying questions directly from the web dashboard, creating a single, seamless interface for monitoring and interacting with running tasks.

### **Description**

In V1, we built the core "Interactive Halting" feature, but it requires users to be at their command line to provide an answer. This plan extends that feature to the web UI. When a task is paused and waiting for input, the web dashboard will now display an input form. Submitting an answer through this form will unblock the paused CLI process and allow the task to resume, making the entire system more flexible and user-friendly.

The main technical challenge is creating a communication channel between the web server process and the separate, paused `cat-herder run` CLI process. We will solve this using a simple and robust file-based messaging system.

### **Prerequisites**

Before starting, please make sure you fully understand the V1 implementation of Interactive Halting, specifically:
*   How `step-runner.ts` uses a `while` loop and the `HumanInterventionRequiredError` to manage the pause/resume cycle.
*   How the task `phase` changes to `waiting_for_input` in the `.state.json` file.
*   How `proc.ts` detects the `askHuman` tool.

### **Summary Checklist**

-   [x] **1. Backend API Endpoint:** Create a `POST` endpoint in the web server to receive answers from the browser.
-   [x] **2. Frontend UI Form:** Add an HTML form to the web pages that allows users to submit an answer.
-   [ ] **3. IPC Bridge (File-Based):** Implement the logic for the web server to write an answer to a file and for the CLI to read it.
-   [ ] **4. Update Orchestrator Logic:** Modify the `step-runner` to listen for both CLI input *and* the new file-based answer signal.
-   [ ] **5. Testing:** Add tests for the new API endpoint and the updated orchestrator logic.
-   [ ] **6. Documentation:** Update `README.md` and `ARCHITECTURE.MD` with details and screenshots of the new UI feature.

---

### **Detailed Implementation Steps**

#### 1. Backend API Endpoint

*   **Objective:** Create a secure API endpoint that the frontend can call to submit a user's answer.
*   **File:** `src/tools/web/routes.ts`
*   **Tasks:**
    1.  **Add `express.json()` middleware:** The web server needs to be able to parse JSON request bodies. Add `router.use(express.json());` near the top of the `createRouter` function.
    2.  **Create the `POST` Route:** Add a new route to handle the submission.
        *   **Path:** `POST /task/:taskId/respond`
        *   **Logic:**
            a.  Get the `taskId` from the URL parameters and the `answer` from the request body.
            b.  **Validate:** Check that `taskId` and `answer` exist.
            c.  **Check State:** Read the task's state file. If its `phase` is NOT `waiting_for_input`, return a `409 Conflict` error, as we can't answer a question that hasn't been asked.
            d.  **Send Answer:** Call a new function (which we'll create in Step 3) to write the answer to a file that the CLI process can find.
            e.  **Respond:** Send a `200 OK` JSON response to the browser to confirm success.
*   **Code Snippet (`src/tools/web/routes.ts`):**
    ```typescript
    // At the top of createRouter function
    router.use(express.json()); // Add this middleware

    // Add this new route handler
    router.post("/task/:taskId/respond", async (req: Request, res: Response) => {
      const { taskId } = req.params;
      const { answer } = req.body;

      if (!taskId || typeof taskId !== 'string' || !answer || typeof answer !== 'string') {
        return res.status(400).json({ error: "Invalid request: taskId and answer are required." });
      }

      const taskDetails = getTaskDetails(stateDir, logsDir, taskId);
      if (!taskDetails || taskDetails.phase !== 'waiting_for_input') {
        return res.status(409).json({ error: "Task is not currently waiting for input." });
      }

      try {
        // This function will be created in the next step
        await writeAnswerToFile(stateDir, taskId, answer);
        res.status(200).json({ message: "Answer submitted successfully. The task will now resume." });
      } catch (error) {
        console.error("Failed to write answer file:", error);
        res.status(500).json({ error: "Failed to process the answer." });
      }
    });
    ```

#### 2. Frontend UI Form

*   **Objective:** Add a user-friendly form to the web UI for submitting an answer.
*   **Files:** `src/templates/web/live-activity.ejs`, `src/templates/web/task-detail.ejs`
*   **Tasks:**
    1.  **Add the HTML Form:** In both `.ejs` files, inside the block that displays the `pendingQuestion`, add an HTML form with a `<textarea>` and a `<button type="submit">`.
    2.  **Add Frontend JavaScript:** Add a `<script>` tag to handle the form submission without reloading the page.
        *   Listen for the form's `submit` event.
        *   Use `event.preventDefault()`.
        *   Use the `fetch` API to `POST` the answer as JSON to the `/task/:taskId/respond` endpoint.
        *   On success, disable the form and show a "Resuming..." message to the user.
        *   If the API returns an error, show an alert to the user.
*   **Code Snippet (to add inside `live-activity.ejs` and `task-detail.ejs`):**
    ```html
    <!-- Inside the card that displays the pendingQuestion -->
    <div class="mt-3">
        <form id="answer-form" data-task-id="<%= taskToShow.taskId %>">
            <div class="mb-2">
                <label for="human-answer" class="form-label"><strong>Your Answer:</strong></label>
                <textarea class="form-control" id="human-answer" name="answer" rows="3" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary">
                <i class="bi bi-send me-1"></i> Submit Answer and Resume
            </button>
            <div id="form-status" class="mt-2"></div>
        </form>
    </div>

    <script>
        document.getElementById('answer-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const taskId = form.dataset.taskId;
            const answer = form.elements.answer.value;
            const statusDiv = document.getElementById('form-status');
            const submitButton = form.querySelector('button[type="submit"]');

            submitButton.disabled = true;
            statusDiv.innerHTML = '<span class="text-info">Submitting...</span>';

            const response = await fetch(`/task/${taskId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answer })
            });

            if (response.ok) {
                form.elements.answer.disabled = true;
                statusDiv.innerHTML = '<span class="text-success">✔ Answer accepted. Task is resuming in the CLI.</span>';
            } else {
                const result = await response.json();
                statusDiv.innerHTML = `<span class="text-danger">✖ Error: ${result.error}</span>`;
                submitButton.disabled = false;
            }
        });
    </script>
    ```

#### 3. IPC Bridge (File-Based)

*   **Objective:** Create the file-based communication channel.
*   **File:** `src/tools/status.ts` (This is a good central place for state-related file helpers).
*   **Tasks:**
    1.  **Create `getAnswerFilePath` helper:** This function will create a consistent file path for the answer file.
    2.  **Create `writeAnswerToFile` function:** This will be called by the API endpoint. It uses the helper to get the path and then writes the answer.
    3.  **Create `readAndDeleteAnswerFile` function:** This will be used by the orchestrator. It checks for the file, reads its content, **and most importantly, deletes it** to prevent it from being read again.
*   **Code Snippet (`src/tools/status.ts`):**
    ```typescript
    // Helper to get the consistent path for an answer file
    function getAnswerFilePath(stateDir: string, taskId: string): string {
      return path.join(stateDir, `${taskId}.answer`);
    }

    // Function for the web server to write the answer
    export async function writeAnswerToFile(stateDir: string, taskId: string, answer: string): Promise<void> {
      const filePath = getAnswerFilePath(stateDir, taskId);
      fs.writeFileSync(filePath, answer, 'utf-8');
    }

    // Function for the CLI orchestrator to read (and delete) the answer
    export async function readAndDeleteAnswerFile(stateDir: string, taskId: string): Promise<string | null> {
      const filePath = getAnswerFilePath(stateDir, taskId);
      if (fs.existsSync(filePath)) {
        const answer = fs.readFileSync(filePath, 'utf-8');
        fs.unlinkSync(filePath); // CRITICAL: Delete the file after reading
        return answer;
      }
      return null;
    }
    ```

#### 4. Update Orchestrator Logic

*   **Objective:** Modify the `step-runner` to wait for input from either the CLI or the new answer file.
*   **File:** `src/tools/orchestration/step-runner.ts`
*   **Concept:** We will use `Promise.race()`. This allows us to start multiple asynchronous operations at once and proceed as soon as the *first one* finishes. We will race the CLI prompt against a file-watcher.
*   **Tasks:**
    1.  **Import new helpers:** Import `readAndDeleteAnswerFile` from `status.ts`.
    2.  **Create a file-watching promise:** Create a new async function, `waitForAnswerFile(stateDir, taskId)`, that polls for the `.answer` file every second. When it finds the file, it will call `readAndDeleteAnswerFile` and resolve with the answer.
    3.  **Refactor `promptUser`:** Rename/refactor it to `waitForHumanInput`. This function will now set up and run the `Promise.race`.
    4.  **Handle Cleanup:** When one promise wins the race, the other operation (CLI prompt or file polling) is still running in the background. You must clean it up to prevent memory leaks. Close the `readline` interface and stop the polling interval. A `finally` block is perfect for this.

*   **Code Snippet (`src/tools/orchestration/step-runner.ts`):**
    ```typescript
    // In step-runner.ts, replace the simple `promptUser` with this more advanced version

    async function waitForHumanInput(question: string, stateDir: string, taskId: string): Promise<string> {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      let pollingInterval: NodeJS.Timeout | null = null;

      // Promise 1: CLI Input
      const cliPromise = new Promise<string>((resolve) => {
        console.log(pc.cyan("\n[Orchestrator] Task has been paused. The AI needs your input.\n"));
        console.log(pc.yellow("🤖 QUESTION:"));
        console.log(question);
        console.log("\n(You can answer here in the CLI or in the web dashboard.)\n");

        rl.question(pc.blue("Your answer: "), (answer) => {
          resolve(answer.trim());
        });
      });

      // Promise 2: File-based Input
      const ipcPromise = new Promise<string>((resolve) => {
        pollingInterval = setInterval(async () => {
          const answer = await readAndDeleteAnswerFile(stateDir, taskId);
          if (answer !== null) {
            console.log(pc.cyan("\n[Orchestrator] Answer received from web UI. Resuming..."));
            resolve(answer);
          }
        }, 1000); // Check every second
      });

      try {
        // Race the two promises
        const answer = await Promise.race([cliPromise, ipcPromise]);
        return answer;
      } finally {
        // CRITICAL CLEANUP
        if (pollingInterval) clearInterval(pollingInterval);
        rl.close();
      }
    }

    // Then, in your executeStep loop, call this new function:
    // const answer = await waitForHumanInput(error.question, resolvedStatePath, taskId);
    ```

#### 5. Testing

*   **Objective:** Ensure the new end-to-end flow is reliable and doesn't have race conditions.
*   **Tasks:**
    1.  **API Test (`test/api.test.ts`):**
        *   Create a new test file for the web routes.
        *   Write a test for the `POST /task/:taskId/respond` endpoint.
        *   Use `fs.writeFileSync` to create a mock `.state.json` file with `phase: 'waiting_for_input'`.
        *   Send a mock request to the endpoint.
        *   Assert that the endpoint creates the `.answer` file with the correct content.
        *   Assert that the endpoint returns a `200 OK` status.
    2.  **Orchestrator Test (`test/orchestrator-interaction.test.ts`):**
        *   Update the existing interaction test.
        *   Instead of mocking `readline`, mock the `fs` module.
        *   In the test, simulate the file appearing by having your mock `fs.existsSync` return `true` after a short delay.
        *   Assert that the `waitForHumanInput` function resolves with the content you mocked for the file.

#### 6. Documentation

*   **Objective:** Update all user-facing documentation to reflect this powerful new capability.
*   **Tasks:**
    1.  **Update `README.md`:**
        *   In the "Interactive Halting" and "Web Dashboard" sections, add text explaining that questions can be answered from the UI.
        *   Add a screenshot of the new question card and input form from the web UI. A picture is worth a thousand words. A good tool for this is `shot-scraper` or Playwright's screenshot capabilities.
    2.  **Update `ARCHITECTURE.MD`:**
        *   Update the Mermaid diagram to show the new flow: `Web UI -> (POST Request) -> Web Server -> (.answer file) -> Orchestrator`.
        *   Update the description for the "Interface Layer" to mention the interactive form.
        *   Update the "Orchestration Layer" to describe its new ability to listen for file-based signals.