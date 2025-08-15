
# PLAN: Implement a Run Journal for Reliable State Tracking

## Goal

To replace the complex and brittle task-state inference logic with a simple, chronological "Run Journal" that serves as the single source of truth for the application's state.

## Description

Currently, the web dashboard determines the "live" running task by scanning all individual state files and applying a set of rules. This logic is fragile; for example, if a task fails unexpectedly, its state file might remain as "running," leading the UI to display incorrect information.

This plan outlines the creation of a new file, `run-journal.json`, which will log key events in chronological order (e.g., `task_started`, `task_finished`). The web server will now read this journal to reliably identify the currently active task and display a correct history. This simplifies the logic, improves reliability, and makes the system's state explicit.

## Summary Checklist

-   [x] **1. Create the Journal Utility:** Implement new functions in `src/tools/status.ts` to create, read, and write to a `run-journal.json` file.
-   [x] **2. Integrate Journal Logging into the Orchestrator:** Modify `src/tools/orchestrator.ts` to log events to the journal at the start and end of tasks and sequences.
-   [x] **3. Refactor the Live Activity Route:** Update the `/live` route in `src/tools/web.ts` to use the new journal for identifying the currently running task.
-   [x] **4. Refactor the History Page Logic:** Update the `/history` route in `src/tools/web.ts` to source its data from the journal, ensuring a consistent and chronologically accurate view.
-   [x] **5. Update Documentation:** Review and update `README.md` to ensure no internal implementation details have leaked and that the developer experience remains accurately described.

---

## Detailed Implementation Steps

### 1. Create the Journal Utility

*   **Objective:** To create a centralized module for all interactions with the new `run-journal.json` file, abstracting away the file system operations.
*   **Task:**
    1.  Go to `src/tools/status.ts`.
    2.  Define a new interface for journal events.
    3.  Add three new functions: `getJournalPath`, `readJournal`, and `logJournalEvent`.

*   **Code Snippet (`src/tools/status.ts`):**

    ```typescript
    // Add this interface at the top of the file
    export interface JournalEvent {
      timestamp: string;
      eventType: 'task_started' | 'task_finished' | 'sequence_started' | 'sequence_finished';
      id: string; // taskId or sequenceId
      parentId?: string; // The sequenceId if it's a task within a sequence
      status?: 'done' | 'failed' | 'interrupted'; // Only for 'finished' events
    }

    // Helper to get the journal file path
    function getJournalPath(): string {
      // This function should be implemented to return the absolute path
      // to `.claude/state/run-journal.json` by using getConfig().
      // For now, we'll assume it exists.
      const projectRoot = getProjectRoot(); // You already have this utility
      const config = await getConfig();
      return path.join(projectRoot, config.statePath, 'run-journal.json');
    }

    // New function to read the journal
    export function readJournal(): JournalEvent[] {
      const journalPath = getJournalPath();
      if (!fs.existsSync(journalPath)) {
        return [];
      }
      try {
        const content = fs.readFileSync(journalPath, 'utf-8');
        return JSON.parse(content) as JournalEvent[];
      } catch (error) {
        console.warn(pc.yellow(`Warning: Could not read or parse run-journal.json. Starting fresh. Error: ${error.message}`));
        return [];
      }
    }

    // New function to log an event
    export function logJournalEvent(event: Omit<JournalEvent, 'timestamp'>): void {
      const journalPath = getJournalPath();
      const journal = readJournal();
      const newEvent: JournalEvent = {
        timestamp: new Date().toISOString(),
        ...event,
      };
      journal.push(newEvent);
      try {
        fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
      } catch (error) {
        console.error(pc.red(`Fatal: Could not write to run-journal.json. Error: ${error.message}`));
      }
    }
    ```

### 2. Integrate Journal Logging into the Orchestrator

*   **Objective:** To ensure the journal is accurately populated by logging events at critical points in the task and sequence lifecycles.
*   **Task:** In `src/tools/orchestrator.ts`, import `logJournalEvent` and call it in the following places:
    1.  **`runTask`:** At the beginning and end.
    2.  **`runTaskSequence`:** At the beginning and end.
    3.  **`runTaskSequence` loop:** When a new task within the sequence starts and finishes.

*   **Code Snippets (`src/tools/orchestrator.ts`):**

    ```typescript
    // In runTask() function, after getting the taskId
    logJournalEvent({ eventType: 'task_started', id: taskId });

    // In runTask() function, at the very end (inside a try/finally block to capture failures)
    // You will need to determine the final status.
    // Example:
    // let finalStatus: 'done' | 'failed' = 'done';
    // try { ... } catch { finalStatus = 'failed'; } finally {
    //   logJournalEvent({ eventType: 'task_finished', id: taskId, status: finalStatus });
    // }

    // In runTaskSequence() function, after getting the sequenceId
    logJournalEvent({ eventType: 'sequence_started', id: sequenceId });

    // Inside the `while (nextTaskPath)` loop in runTaskSequence()
    const nextTaskId = taskPathToTaskId(nextTaskPath, projectRoot);
    logJournalEvent({ eventType: 'task_started', id: nextTaskId, parentId: sequenceId });

    // After a task completes successfully inside the loop
    const completedTaskId = taskPathToTaskId(nextTaskPath, projectRoot);
    logJournalEvent({ eventType: 'task_finished', id: completedTaskId, status: 'done' });
    
    // At the end of runTaskSequence(), similar to runTask()
    // let finalSequenceStatus: 'done' | 'failed' = ...;
    // logJournalEvent({ eventType: 'sequence_finished', id: sequenceId, status: finalSequenceStatus });
    ```

### 3. Refactor the Live Activity Route

*   **Objective:** To replace the old, unreliable "live task" detection logic with a simple and robust method that uses the run journal.
*   **Task:**
    1.  Go to `src/tools/web.ts`.
    2.  In the `app.get("/live", ...)` route handler, replace the existing logic with a new function that reads the journal.

*   **Code Snippet (`src/tools/web.ts`):**

    ```typescript
    // This helper function will replace the complex file-scanning logic
    function findActiveTaskFromJournal(journal: JournalEvent[]): JournalEvent | null {
      const finishedIds = new Set<string>();
      // Iterate backwards to find the last finished events efficiently
      for (let i = journal.length - 1; i >= 0; i--) {
        const event = journal[i];
        if (event.eventType.endsWith('_finished')) {
          finishedIds.add(event.id);
        }
      }

      // Iterate backwards again to find the most recent 'task_started'
      // event for a task that has not been finished.
      for (let i = journal.length - 1; i >= 0; i--) {
        const event = journal[i];
        if (event.eventType === 'task_started' && !finishedIds.has(event.id)) {
          return event; // This is our active task
        }
      }

      return null; // No active task found
    }

    // Inside the app.get('/live', ...) handler:
    // ...
    const journal = readJournal(); // Your new utility function from status.ts
    const activeTaskEvent = findActiveTaskFromJournal(journal);
    
    const taskDetails = activeTaskEvent 
      ? getTaskDetails(stateDir, logsDir, activeTaskEvent.id) 
      : null;
      
    const parentSequence = activeTaskEvent?.parentId 
      ? getSequenceDetails(stateDir, config, activeTaskEvent.parentId)
      : null;
      
    res.render("live-activity", { 
      runningTask: taskDetails, 
      parentSequence: parentSequence, // Pass sequence details if available
      page: 'live-activity'
    });
    ```

### 4. Refactor the History Page Logic

*   **Objective:** To unify the data source for the application, ensuring the history page is also driven by the reliable run journal.
*   **Task:** In `src/tools/web.ts`, update the `app.get("/history", ...)` route to build its task and sequence lists from the journal instead of scanning the state directory.

*   **Guidance (`src/tools/web.ts`):**
    The logic here will involve processing the journal to reconstruct the history.
    1.  Read the journal using `readJournal()`.
    2.  Create maps to hold the latest state of each task and sequence (`Map<string, TaskInfo>`).
    3.  Iterate through the journal events and update the maps. For example, a `task_started` event creates an entry, and a `task_finished` event updates its status.
    4.  Convert the maps to arrays and pass them to the `history.ejs` template. This ensures the history page reflects the exact sequence of events as they happened.

### 5. Update Documentation

*   **Objective:** To ensure the project's `README.md` is accurate and does not contain outdated information about internal implementation.
*   **Task:**
    1.  Thoroughly read `README.md`.
    2.  This change is primarily an internal refactor, so user-facing documentation should not need significant changes.
    3.  Confirm that no implementation details about how the "live" status is determined are mentioned. If they are, remove them to keep the documentation focused on user interaction rather than internal mechanics.

## Error Handling & Warnings

*   **Corrupt Journal File:** The `readJournal()` function should be wrapped in a `try...catch` block. If `run-journal.json` is malformed or unreadable, the function should log a clear warning to the console and return an empty array `[]`. The application should gracefully handle this by showing "No tasks running" or an empty history.
*   **Write Failures:** If `logJournalEvent()` fails to write to the file, it should log a critical error. This is a more serious condition, as it means the state of the application can no longer be tracked reliably.