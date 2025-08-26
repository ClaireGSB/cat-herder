

# PLAN.md

## Title & Goal

**Title:** Correct and Finalize Interactive Halting Enhancements

**Goal:** To fully implement and fix the interactive halting workflow, ensuring UI stability, consistent status propagation across all system levels (step, task, and sequence), and accurate pause time accounting.

## Description

This plan addresses the incomplete execution of a previous initiative. The primary goals were to improve the Interactive Halting feature, but the implementation was flawed. The following issues persist:

1.  **Critical UI Bug:** A typo in the client-side JavaScript (`window.dashboard.websocket` instead of `window.dashboard.ws`) completely prevented the UI fix from working. As a result, the live log stream still breaks, and the question form becomes stale on subsequent questions.
2.  **Incomplete Status Propagation:** When a task pauses to wait for input, its parent sequence and the specific pipeline step that paused do not reflect this status change in the UI. They incorrectly remain in a `running` state, creating an inconsistent and confusing user experience.

This plan provides the exact steps to **correct the UI bug** and **fully implement the status propagation and pause time tracking** as originally intended. The outcome will be a stable, intuitive, and consistent interactive workflow.

## Summary Checklist

-   [x] **Fix Backend Status Propagation**: Update the orchestrator to set the status of the **step**, **task**, and **sequence** to `waiting_for_input` and back to `running`.
-   [ ] **Implement Accurate Pause Tracking**: Correctly add the time spent waiting for human input to the `totalPauseTime` statistic for both tasks and sequences.
-   [ ] **Fix the Web UI Reload Bug**: Correct the JavaScript property name in `live-activity-page.js` to enable the page reload fix.
-   [ ] **Verify UI Templates and Types**: Confirm that all necessary types and UI templates for displaying the `waiting_for_input` status are in place.
-   [ ] **Update Documentation**: Update `ARCHITECTURE.md` and `README.md` to reflect the correct, fully-implemented behavior.

## Detailed Implementation Steps

### 1. Fix Backend Status Propagation

*   **Objective:** To ensure that when a task pauses, its current step and parent sequence also reflect the `waiting_for_input` status.
*   **Task:** Modify the `HumanInterventionRequiredError` catch block in `src/tools/orchestration/step-runner.ts` to update all relevant status files.
*   **Code Snippet (`src/tools/orchestration/step-runner.ts`):**

    ```typescript
    // ... inside catch (error) block in executeStep function ...
    if (error instanceof HumanInterventionRequiredError) {
      // 1. PAUSE: Update task, step, AND sequence status to 'waiting_for_input'
      updateStatus(statusFile, s => {
        s.phase = 'waiting_for_input';
        s.steps[name] = 'waiting_for_input'; // <-- FIX: Set the current step's status
        s.pendingQuestion = { 
          question: error.question, 
          timestamp: new Date().toISOString() 
        };
      });

      if (sequenceStatusFile) {
        updateSequenceStatus(sequenceStatusFile, s => { s.phase = 'waiting_for_input'; });
      }

      try {
        // ... (waitForHumanInput logic) ...

        // 3. RESUME: Update task, step, AND sequence status
        updateStatus(statusFile, s => {
          // ... (interactionHistory and pendingQuestion logic) ...
          s.phase = 'running';
          s.steps[name] = 'running'; // <-- FIX: Set the step back to running
          // ... (pause time logic) ...
        });

        if (sequenceStatusFile) {
          updateSequenceStatus(sequenceStatusFile, s => {
            s.phase = 'running';
            // ... (pause time logic) ...
          });
        }
        // ...
    ```

### 2. Implement Accurate Pause Tracking

*   **Objective:** To correctly calculate and store the duration of human input pauses.
*   **Task:** In the same `try` block as the above fix in `src/tools/orchestration/step-runner.ts`, wrap the `waitForHumanInput` call with a timer and update the `totalPauseTime` stat.
*   **Code Snippet (`src/tools/orchestration/step-runner.ts`):**

    ```typescript
    // ... inside the try block after the HumanInterventionRequiredError catch
    try {
      const stateDir = path.dirname(statusFile);
      const pauseStartTime = Date.now(); // <-- START TIMER
      const answer = await waitForHumanInput(error.question, stateDir, taskId);
      const pauseDurationSeconds = (Date.now() - pauseStartTime) / 1000; // <-- CALCULATE DURATION

      // Update task status with pause time
      updateStatus(statusFile, s => {
        // ... (other updates) ...
        if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0 };
        s.stats.totalPauseTime += pauseDurationSeconds; // <-- ADD TO TASK PAUSE TIME
      });
      
      // Update sequence status with pause time
      if (sequenceStatusFile) {
        updateSequenceStatus(sequenceStatusFile, s => {
            // ... (other updates) ...
            if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0, totalTokenUsage: {} };
            s.stats.totalPauseTime += pauseDurationSeconds; // <-- ADD TO SEQUENCE PAUSE TIME
        });
      }
      // ...
    ```

### 3. Fix the Web UI Reload Bug

*   **Objective:** To enable the client-side UI fix by correcting the JavaScript property name, ensuring the Live Activity page reloads correctly.
*   **Task:** In `src/public/js/live-activity-page.js`, change `window.dashboard?.websocket` to `window.dashboard?.ws`.
*   **Code Snippet (`src/public/js/live-activity-page.js`):**

    ```javascript
    // ... inside DOMContentLoaded listener ...
    const patchInterval = setInterval(() => {
        // BEFORE (BUG): const ws = window.dashboard?.websocket;
        // AFTER (FIX):
        const ws = window.dashboard?.ws; 

        if (ws && typeof ws.onmessage === 'function') {
            clearInterval(patchInterval);
            const originalOnMessage = ws.onmessage;
            
            // ... (rest of the patching logic) ...
        }
    }, 50);
    // ...
    ```

### 4. Verify UI Templates and Types

*   **Objective:** To confirm that all supporting UI and type definitions are correct.
*   **Task:** This step is for verification. No code changes are required.
    *   **`src/tools/status.ts`**: The `SequencePhase` type correctly includes `waiting_for_input`.
    *   **`src/templates/web/partials/header.ejs`**: The CSS class `.status-waiting_for_input` is correctly defined.
    *   **`src/templates/web/partials/_status-badge.ejs`**: The template already has logic to render the `waiting_for_input` badge with the correct icon and style.

### 5. Update Documentation

*   **Objective:** To ensure the project's documentation accurately reflects the final, correct behavior.
*   **Task:**
    1.  **Modify `ARCHITECTURE.md`:**
        *   In the "State Layer" section, clarify that the `steps` object within `TaskStatus` and the `phase` property of `SequenceStatus` both support the `waiting_for_input` value.
        *   In the "Pause Time Tracking" bullet point, explicitly state that pause time includes both API rate limits and time spent waiting for human input.
    2.  **Modify `README.md`:**
        *   In the "Interactive Halting" section, update the description to mention that when a task pauses, the specific step *and* the parent sequence are also considered paused in the UI.
        *   In the "State Files" section, update the description of `totalPauseTime` to note that it includes human interaction wait time.

## Error Handling & Warnings

*   **State File Access:** If an orchestrator process fails to write to a status file (e.g., due to a rare race condition or permissions issue), it should log a clear warning to the console but continue execution. Task integrity is the priority.
*   **UI Reload:** The client-side reload mechanism is robust. In the unlikely event of a persistent error, the user can manually reload the page to synchronize the state.