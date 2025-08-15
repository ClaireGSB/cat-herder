
# PLAN: Fix `TypeError` Crash on Sequence Detail Page

## Goal

To resolve the server crash that occurs when viewing a sequence's detail page by ensuring the backend provides the necessary data to the frontend template.

## Description

When a user navigates to the detail page for a task sequence, the web server crashes with a `TypeError: Cannot read properties of undefined (reading 'replace')`.

The root cause is a data mismatch: the backend logic in `src/tools/web.ts` was assembling a list of tasks for the sequence but failed to include a `filename` property for each task. The frontend template, `sequence-detail.ejs`, explicitly tries to access `task.filename`, causing a crash when this property is `undefined`.

The fix involves updating the backend to correctly populate the `filename` property and making the frontend template more robust to prevent similar issues.

## Summary Checklist

-   [x] **1. Backend: Add `filename` to Task Data:** Modify the `getSequenceDetails` function in `src/tools/web.ts` to properly extract and include the task's filename.
-   [ ] **2. Frontend: Improve Template Robustness:** Update the `sequence-detail.ejs` template to simplify its logic and add a fallback for displaying the filename.

---

## Detailed Implementation Steps

### 1. Backend: Add `filename` to Task Data

*   **Objective:** To ensure the backend provides all necessary data (`filename`) to the frontend template, which will fix the root cause of the crash.
*   **Task:**
    1.  Open the file `src/tools/web.ts`.
    2.  Locate the `getSequenceDetails` function.
    3.  Inside the `for` loop that builds the `tasks` array, use `path.basename()` to extract the filename from the `taskPath` and add it to the object being pushed to the `sequenceDetails.tasks` array.

*   **Code Snippet (`src/tools/web.ts`):**

    ```typescript
    // Inside the getSequenceDetails function...
    // ...inside the for...of loop...
    try {
        const taskStateContent = fs.readFileSync(path.join(stateDir, stateFileName), 'utf8');
        const taskState = JSON.parse(taskStateContent);
        if (taskState.parentSequenceId === sequenceId) {
            // ... (status logic is correct)
            
            // --- The Fix is Here ---
            const taskPath = taskState.taskPath || 'unknown'; // Get the taskPath
            sequenceDetails.tasks.push({
                taskId: taskState.taskId || stateFileName.replace('.state.json', ''),
                taskPath: taskPath,
                filename: path.basename(taskPath), // <<< ADD THIS LINE
                status: taskStatus,
                phase: taskState.phase,
                lastUpdate: taskState.lastUpdate
            });
        }
    } catch (e) { /* ... */ }
    // ...
    ```

### 2. Frontend: Improve Template Robustness

*   **Objective:** To simplify the EJS template logic, making it less likely to crash in the future and providing better fallbacks.
*   **Task:**
    1.  Open the file `src/templates/web/sequence-detail.ejs`.
    2.  Simplify the `if` condition that checks whether to show a "Details" button.
    3.  Add a fallback to the line that displays the filename.

*   **Code Snippets (`src/templates/web/sequence-detail.ejs`):**

    **Change 1: Simplify the "Details" button logic.**
    *   **FROM (Current):**
        ```html
        <% if (task.taskId && task.taskId !== `${sequence.folderPath}-${task.filename.replace('.md', '')}`) { %>
        ```
    *   **TO (Robust):** A simple check for `taskId` is sufficient and safer.
        ```html
        <% if (task.taskId) { %>
        ```

    **Change 2: Add a fallback for the filename display.**
    *   **FROM (Current):**
        ```html
        <h6 class="mb-1">
            <span class="badge bg-light text-dark me-2"><%= index + 1 %></span>
            <%= task.filename %>
        ```
    *   **TO (Robust):**
        ```html
        <h6 class="mb-1">
            <span class="badge bg-light text-dark me-2"><%= index + 1 %></span>
            <%= task.filename || 'Unknown File' %>
        ```