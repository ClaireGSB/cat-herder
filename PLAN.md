
# PLAN.md

### **Title: Enhance Interaction History with Separate Question and Answer Timestamps**

**Goal:** To accurately track the time elapsed between an AI's question and a human's answer by storing two distinct timestamps for each interaction.

### **Description**

Currently, when the AI asks a question, a `pendingQuestion` object with a timestamp is created in the task's state file. When a human provides an answer, that answer is moved to an `interactionHistory` array, but only a single timestamp (for the answer) is retained. The original timestamp of the question is lost.

This change will modify the `interactionHistory` to store both the timestamp of when the question was asked and when it was answered. This will allow us to accurately measure and display the human response time for each interaction, providing better insight into the workflow's efficiency.

### **Summary Checklist**

-   [ ] **Step 1: Update Type Definitions** - Modify the `Interaction` interface in `src/types.ts`.
-   [ ] **Step 2: Modify State Update Logic** - Adjust the logic in `src/tools/orchestration/step-runner.ts` to save both timestamps.
-   [ ] **Step 3: Update UI Template** - Update `src/templates/web/task-detail.ejs` to display both timestamps and the response duration.

---

### **Detailed Implementation Steps**

#### **Step 1: Update Type Definitions (`src/types.ts`)**

*   **Objective:** Define the new, more detailed data structure for an interaction event in a central location to ensure type safety across the application.
*   **Task:**
    1.  Open the `src/types.ts` file.
    2.  Find the `Interaction` interface.
    3.  Modify the interface to include separate fields for the question and answer timestamps.

*   **Code Snippet:**

    **Before:**
    ```typescript
    export interface Interaction {
      question: string;
      answer: string;
      timestamp: string;
    }
    ```

    **After:**
    ```typescript
    export interface Interaction {
      question: string;
      answer: string;
      questionTimestamp: string; // Renamed from timestamp
      answerTimestamp: string;   // New field
    }
    ```

#### **Step 2: Modify State Update Logic (`src/tools/orchestration/step-runner.ts`)**

*   **Objective:** Implement the core logic change to capture the question's timestamp from the `pendingQuestion` object *before* it is cleared and save it alongside the answer's timestamp.
*   **Task:**
    1.  Open `src/tools/orchestration/step-runner.ts`.
    2.  Locate the `executeStep` function.
    3.  Find the `catch (error)` block that handles the `HumanInterventionRequiredError`.
    4.  Inside this block, after the `waitForHumanInput` call, modify the `updateStatus` function call.
    5.  You will need to capture the `questionTimestamp` from the state *before* it's overwritten. The `updateStatus` function gives you access to the current state (`s`), so you can read `s.pendingQuestion.timestamp`.

*   **Code Snippet:**

    Find this section inside the `catch` block for `HumanInterventionRequiredError`:
    ```typescript
    // Inside the updateStatus call after getting the answer
    s.interactionHistory.push({
      question: error.question,
      answer,
      timestamp: new Date().toISOString() // This is the part to change
    });
    s.pendingQuestion = undefined;
    // ...
    ```

    Modify it to look like this:
    ```typescript
    // Inside the updateStatus call after getting the answer
    const questionTimestamp = s.pendingQuestion?.timestamp; // Capture the question timestamp
    if (questionTimestamp) { // Ensure it exists before pushing
        s.interactionHistory.push({
            question: error.question,
            answer,
            questionTimestamp: questionTimestamp, // Use the captured timestamp
            answerTimestamp: new Date().toISOString() // Create a new timestamp for the answer
        });
    }
    s.pendingQuestion = undefined;
    // ...
    ```

#### **Step 3: Update UI Template (`src/templates/web/task-detail.ejs`)**

*   **Objective:** Visually present the new, more detailed timestamp information on the task detail page in the web dashboard.
*   **Task:**
    1.  Open `src/templates/web/task-detail.ejs`.
    2.  Locate the "Human Interactions" section (it checks for `task.interactionHistory`).
    3.  Modify the loop to display both timestamps.
    4.  Add a calculation for the response duration for better UX.

*   **Code Snippet:**

    **Before:**
    ```ejs
    <!-- Timestamp -->
    <div class="text-muted small">
        <i class="bi bi-clock me-1"></i>
        <%= new Date(interaction.timestamp).toLocaleString() %>
    </div>
    ```

    **After (with added duration):**
    ```ejs
    <!-- Timestamps and Duration -->
    <% 
        const questionDate = new Date(interaction.questionTimestamp || interaction.timestamp); // Fallback for old data
        const answerDate = new Date(interaction.answerTimestamp);
        const durationSeconds = (answerDate.getTime() - questionDate.getTime()) / 1000;
        const formattedDuration = helpers.formatDuration(durationSeconds);
    %>
    <div class="text-muted small d-flex justify-content-between">
        <span>
            <i class="bi bi-box-arrow-in-right me-1" title="Question Time"></i>
            Asked: <%= questionDate.toLocaleString() %>
            <i class="bi bi-box-arrow-in-left me-1 ms-3" title="Answer Time"></i>
            Answered: <%= new Date(interaction.answerTimestamp).toLocaleString() %>
        </span>
        <strong title="Response Time">
            <i class="bi bi-hourglass-split me-1"></i>
            <%= formattedDuration %>
        </strong>
    </div>
    ```

### **Error Handling & Warnings**

*   **Backward Compatibility:** The system must not crash if it encounters an old state file where `interactionHistory` objects only have a single `timestamp` property.
    *   **Mitigation:** The EJS template change shown above includes a fallback: `interaction.questionTimestamp || interaction.timestamp`. This will gracefully handle old data by using the single `timestamp` field if the new `questionTimestamp` is not available, preventing the UI from breaking.
*   **No CLI Changes:** No warnings or errors need to be added to the CLI. The change is confined to the state file and the web UI.

