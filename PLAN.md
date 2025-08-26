

# PLAN.md

## Title & Goal

**Title:** Enhance Interactive Halting UX and Status Consistency

**Goal:** To improve the user experience of the interactive halting feature by fixing UI bugs, ensuring consistent status propagation from tasks to sequences, and accurately tracking all pause times.

## Description

This plan addresses three related issues in the interactive halting workflow:

1.  **Web UI Bugs:** On the "Live Activity" page, when the AI asks a question, the live log stream disconnects and does not resume. Furthermore, if the AI asks a second question, the UI does not update, showing the first question and its answer instead of the new one.
2.  **Status Inconsistency:** When a task enters the `waiting_for_input` state, its parent sequence incorrectly remains in a `running` state. This gives a misleading view of the overall workflow status.
3.  **Inaccurate Pause Tracking:** The `totalPauseTime` metric for tasks and sequences currently only accounts for pauses due to API rate limits. It does not include the time the system spends waiting for human input, which is a critical part of the pause duration.

This initiative will fix the UI bugs by ensuring the live view is always synchronized, align the sequence status with the active task's status, and implement correct pause time accounting for human interactions.

## Summary Checklist

-   [ ] **Update Core Types**: Add the `waiting_for_input` state to the `SequencePhase` type for consistency.
-   [ ] **Enhance Status Propagation**: Modify the orchestrator to update the parent sequence's status when a task pauses for input and resumes.
-   [ ] **Implement Accurate Pause Tracking**: Add logic to measure the time spent waiting for human input and add it to the `totalPauseTime` statistic for both tasks and sequences.
-   [ ] **Fix Web UI Bugs**: Implement a client-side fix on the "Live Activity" page to ensure the UI correctly refreshes during interactive halting events.
-   [ ] **Update Web Dashboard UI**: Ensure the UI templates can correctly render the new `waiting_for_input` status for sequences.
-   [ ] **Update Documentation**: Update `ARCHITECTURE.md` and `README.md` to reflect the improved status handling and behavior.

## Detailed Implementation Steps

### 1. Update Core Types

*   **Objective:** To make the system aware that a sequence can be in a `waiting_for_input` state.
*   **Task:** Modify the `SequencePhase` type definition in `src/tools/status.ts`.
*   **Code Snippet (`src/tools/status.ts`):**

    ```typescript
    // BEFORE
    export type SequencePhase = "pending" | "running" | "done" | "failed" | "interrupted" | "waiting_for_reset";

    // AFTER
    export type SequencePhase = "pending" | "running" | "done" | "failed" | "interrupted" | "waiting_for_reset" | "waiting_for_input";
    ```

### 2. Enhance Status Propagation

*   **Objective:** To ensure a sequence's status accurately reflects that it is paused when its active task is waiting for input.
*   **Task:** In `src/tools/orchestration/step-runner.ts`, update the parent sequence's status file before waiting for input and after receiving it.
*   **Code Snippet (`src/tools/orchestration/step-runner.ts`):**
    Within the `executeStep` function, inside the `catch (error)` block for `HumanInterventionRequiredError`:

    ```typescript
    // ... inside catch (error)
    if (error instanceof HumanInterventionRequiredError) {
      // 1. PAUSE: Update task AND sequence status
      updateStatus(statusFile, s => { /* ... existing logic ... */ });
      if (sequenceStatusFile) {
        updateSequenceStatus(sequenceStatusFile, s => { s.phase = 'waiting_for_input'; });
      }

      try {
        // 2. PROMPT: Ask user the question (existing logic)
        const answer = await waitForHumanInput(error.question, stateDir, taskId);

        // 3. RESUME: Update task AND sequence status again
        updateStatus(statusFile, s => { /* ... existing logic ... */ });
        if (sequenceStatusFile) {
          updateSequenceStatus(sequenceStatusFile, s => { s.phase = 'running'; });
        }
        
        // ... existing logic ...
      } 
      // ... existing logic ...
    }
    ```

### 3. Implement Accurate Pause Tracking

*   **Objective:** To correctly measure and record the time spent waiting for human input.
*   **Task:** In `src/tools/orchestration/step-runner.ts`, start a timer before waiting for input and add the elapsed time to the `totalPauseTime` stat upon resume.
*   **Code Snippet (`src/tools/orchestration/step-runner.ts`):**
    Within the `executeStep` function, inside the `try` block that follows the `HumanInterventionRequiredError` catch block:

    ```typescript
    // ... inside the try block where waitForHumanInput is called
    try {
      const stateDir = path.dirname(statusFile);
      const pauseStartTime = Date.now(); // <-- START TIMER
      const answer = await waitForHumanInput(error.question, stateDir, taskId);
      const pauseDurationSeconds = (Date.now() - pauseStartTime) / 1000; // <-- CALCULATE DURATION

      // RESUME: Update status with history and pause time
      updateStatus(statusFile, s => {
        s.interactionHistory.push({ /* ... */ });
        s.pendingQuestion = undefined;
        s.phase = 'running';
        if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0 };
        s.stats.totalPauseTime += pauseDurationSeconds; // <-- ADD TO TASK PAUSE TIME
      });
      
      if (sequenceStatusFile) {
        updateSequenceStatus(sequenceStatusFile, s => {
            s.phase = 'running';
            if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0, totalTokenUsage: {} };
            s.stats.totalPauseTime += pauseDurationSeconds; // <-- ADD TO SEQUENCE PAUSE TIME
        });
      }

      feedbackForResume = `You previously asked: "${error.question}". The user responded: "${answer}". Continue your work based on this answer.`;
    } 
    // ...
    ```

### 4. Fix Web UI Bugs

*   **Objective:** To fix the disconnected log stream and stale question form on the Live Activity page.
*   **Task:** Implement a client-side fix in `src/public/js/live-activity-page.js` to trigger a page reload on critical state transitions. Merge the logic from `live-activity.js` into it and then clear `live-activity.js`.
*   **Code Snippet (`src/public/js/live-activity-page.js`):**

    ```javascript
    document.addEventListener('DOMContentLoaded', function() {
        let currentPhase = window.liveActivityData?.runningTask?.phase || null;
    
        const patchInterval = setInterval(() => {
            const ws = window.dashboard?.ws;
            if (ws && typeof ws.onmessage === 'function') {
                clearInterval(patchInterval);
                const originalOnMessage = ws.onmessage;
    
                ws.onmessage = function(event) {
                    let needsReload = false;
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'task_update' && msg.data) {
                            const newPhase = msg.data.phase;
                            if (newPhase !== currentPhase) {
                                if ((currentPhase === 'running' && newPhase === 'waiting_for_input') ||
                                    (currentPhase === 'waiting_for_input' && newPhase === 'running')) {
                                    needsReload = true;
                                }
                                currentPhase = newPhase;
                            }
                        }
                    } catch (e) { /* Ignore non-JSON messages */ }
    
                    if (needsReload) {
                        window.location.reload();
                    } else {
                        originalOnMessage.call(this, event);
                    }
                };
            }
        }, 50);

        setTimeout(() => clearInterval(patchInterval), 5000); // Failsafe
    
        window.dashboard.initWebSocket();
        
        // Logic from live-activity.js is now here
        if (window.dashboard && typeof window.dashboard.initializeLiveView === 'function') {
            const initialData = window.liveActivityData || {};
            window.dashboard.initializeLiveView(initialData.runningTask);
        }
    });
    ```

### 5. Update Web Dashboard UI

*   **Objective:** To ensure sequence status badges display the `waiting_for_input` state correctly.
*   **Task:** The existing partial `src/templates/web/partials/_status-badge.ejs` already supports the `waiting_for_input` status. The primary task is to confirm it is used correctly for sequences on the `live-activity.ejs` and `sequence-detail.ejs` pages. No code changes are expected here, but validation is required.

### 6. Update Documentation

*   **Objective:** To keep the project's documentation synchronized with the new behavior.
*   **Task:**
    1.  **Modify `ARCHITECTURE.md`:**
        *   In the "State Layer" section, explicitly mention that the `SequenceStatus` object now includes a `waiting_for_input` phase.
        *   Update the `Data Flow Diagram` to reflect that the Orchestrator updates the Sequence state file when a task pauses.
        *   Clarify that `totalPauseTime` in the state includes time spent waiting for human input.
    2.  **Modify `README.md`:**
        *   In the "Interactive Halting" section, add a sentence clarifying that when a task pauses to ask a question, the entire sequence is also considered paused.
        *   In the "State Files" section under "Debugging and Logs", mention that `totalPauseTime` in the sequence state file includes human input wait time.

## Error Handling & Warnings

*   **Status File Writes:** If the `sequenceStatusFile` cannot be written to for any reason (e.g., permissions), the system should log a non-fatal warning to the console and proceed. The task's execution is paramount; sequence status is for monitoring.
*   **UI Reload:** The UI fix relies on a page reload, which is robust. There are no user-facing errors to handle.
*   **Configuration:** No changes are being made to `cat-herder.config.js`, so no new validation is required.