
# PLAN.md

## Title & Goal

**Title:** Stabilize Live Activity Page Logs and Refresh Behavior

**Goal:** To ensure continuous, accurate live log streaming and correct page refreshing on phase and step changes for AI-driven tasks, especially during interactive halting.

## Description

The Live Activity page currently fails to maintain live log streams and refresh correctly after critical task phase changes (e.g., entering/exiting `waiting_for_input`) or step transitions. This was due to fragmented client-side logic for state tracking and page reloading, compounded by type mismatches in the data access layer preventing initial log content from being properly rendered for active tasks. This plan centralizes live activity state management and reload triggers within `dashboard.js`, simplifies `live-activity-page.js` to rely on this central logic, and unifies data model definitions across the backend to prevent inconsistent data representation.

The new behavior will ensure:
1.  Initial log content for the active step is *always* displayed immediately upon loading the Live Activity page, even when the task is `running` or `waiting_for_input`.
2.  The page correctly reloads when the task transitions between `running` and `waiting_for_input` phases.
3.  The page correctly reloads when the AI moves to a new step.
4.  Live log streaming updates continuously during active phases.
5.  The page gracefully handles task completion, redirection, or final status display.

## Summary Checklist

-   [x] **Standardize Web Data Access Types**: Unify `TaskStatus` and `SequenceStatus` definitions in `src/tools/web/data-access.ts` with the core definitions from `src/tools/status.ts`.
-   [x] **Centralize Live Activity State Management**: Refactor `src/public/js/dashboard.js` to track the task's current phase and trigger appropriate page reloads for critical state changes.
-   [x] **Simplify Live Activity Page Initialization**: Update `src/public/js/live-activity-page.js` to remove redundant patching logic.
-   [x] **Verify End-to-End Behavior**: Confirm the bug is fully resolved across all relevant scenarios.
-   [ ] **Update Documentation**: Reflect changes in `README.md` and `ARCHITECTURE.MD`.

## Detailed Implementation Steps

---

### 1. Standardize Web Data Access Types

*   **Objective:** Eliminate type mismatches and ensure `src/tools/web/data-access.ts` uses the consistent, comprehensive `TaskStatus` and `SequenceStatus` definitions from `src/tools/status.ts`. This is foundational for correct data interpretation.

*   **Task:** **Replace the entire content of `src/tools/web/data-access.ts`** with the code provided below. This ensures all interfaces and functions correctly align with the central data models.

*   **Code Snippet (`src/tools/web/data-access.ts` - COMPLETE REPLACEMENT):**
    ```typescript
    import fs from "node:fs";
    import path from "node:path";
    // Import the comprehensive TaskStatus and SequenceStatus from the core status file.
    // We also need Phase and ModelTokenUsage types for consistency.
    import { 
      readJournal, 
      JournalEvent, 
      TaskStatus,       // This is the full TaskStatus from ../status.js
      SequenceStatus,   // This is the full SequenceStatus from ../status.js
      Phase,            // This is the Phase type from ../status.js
      ModelTokenUsage   // This is the ModelTokenUsage type from ../status.js
    } from "../status.js";
    // Using StatusPhase from ../../types.js for now, assuming it's compatible with Phase from status.js
    import { ALL_STATUS_PHASES, StatusPhase } from '../../types.js'; 


    // TaskDetails should extend the full TaskStatus and just add the 'logs' property.
    // pendingQuestion and interactionHistory are already part of the main TaskStatus.
    export interface TaskDetails extends TaskStatus {
      logs?: { [stepName: string]: { log?: string; reasoning?: string; raw?: string; }; };
    }

    // SequenceInfo is a lightweight interface for parent sequence links in tasks.
    // Its phase should be compatible with the main SequenceStatus.
    export interface SequenceInfo {
      sequenceId: string;
      phase: Phase; // Use the Phase type from ../status.js
      folderPath?: string;
      branch?: string;
    }

    // SequenceTaskInfo describes tasks within a sequence.
    // Its status should also be compatible with the main Phase type.
    export interface SequenceTaskInfo {
      taskId: string;
      taskPath: string;
      filename: string;
      status: Phase; // Use the Phase type from ../status.js
      phase?: Phase; // Optional, can be same as status but kept for consistency with original
      lastUpdate?: string;
    }

    // SequenceDetails extends the full SequenceStatus and adds the 'tasks' array.
    export interface SequenceDetails extends SequenceStatus {
      tasks: SequenceTaskInfo[];
    }

    export function getAllTaskStatuses(stateDir: string): TaskStatus[] {
      if (!fs.existsSync(stateDir)) return [];
      const files = fs.readdirSync(stateDir).filter(f => f.endsWith(".state.json") && !f.startsWith("sequence-"));
      const tasks: TaskStatus[] = [];
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(stateDir, file), "utf8");
          const state = JSON.parse(content);
          const fileStat = fs.statSync(path.join(stateDir, file));
          
          // Ensure the object pushed matches the TaskStatus interface from ../status.js
          // Provide defaults for properties that might be missing in older state files
          tasks.push({
            version: state.version || 1, // Ensure version is present
            taskId: state.taskId || file.replace(".state.json", ""),
            taskPath: state.taskPath || "unknown",
            startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
            branch: state.branch || "",
            pipeline: state.pipeline,
            parentSequenceId: state.parentSequenceId,
            currentStep: state.currentStep || "",
            phase: state.phase || "pending", // Default to 'pending' if missing
            steps: state.steps || {}, // Ensure steps is an object
            tokenUsage: state.tokenUsage || {}, // Ensure tokenUsage is an object
            stats: state.stats || null, // Ensure stats is null or object
            lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
            prUrl: state.prUrl,
            lastCommit: state.lastCommit,
            pendingQuestion: state.pendingQuestion,
            interactionHistory: state.interactionHistory || [] // Ensure interactionHistory is an array
          });
        } catch (error) {
          console.error(`Error reading state file ${file}:`, error);
          // For errors, create a minimal TaskStatus that clearly indicates failure
          tasks.push({ 
            version: 1, taskId: `ERROR: ${file}`, taskPath: "unknown", 
            startTime: new Date().toISOString(), branch: "", currentStep: "", 
            phase: "failed", steps: {}, tokenUsage: {}, stats: null, 
            lastUpdate: new Date().toISOString(), interactionHistory: [] 
          });
        }
      }
      return tasks.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
    }

    export function getAllSequenceStatuses(stateDir: string): SequenceStatus[] {
      if (!fs.existsSync(stateDir)) return [];
      const files = fs.readdirSync(stateDir).filter(f => f.startsWith('sequence-') && f.endsWith('.state.json'));
      const sequences: SequenceStatus[] = [];
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(stateDir, file), "utf8");
          const state = JSON.parse(content);
          const fileStat = fs.statSync(path.join(stateDir, file));
          const folderName = state.sequenceId?.replace('sequence-', '');

          // Ensure the object pushed matches the SequenceStatus interface from ../status.js
          sequences.push({
            version: state.version || 1, // Ensure version is present
            sequenceId: state.sequenceId || file.replace('.state.json', ''),
            startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
            branch: state.branch || "",
            phase: state.phase || "pending", // Default to 'pending' if missing
            currentTaskPath: state.currentTaskPath || null,
            completedTasks: state.completedTasks || [],
            lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
            stats: state.stats || null, // Ensure stats is null or object
          });
        } catch (error) {
          console.error(`Error reading sequence state file ${file}:`, error);
          // For errors, create a minimal SequenceStatus that clearly indicates failure
          sequences.push({ 
            version: 1, sequenceId: `ERROR: ${file}`, startTime: new Date().toISOString(), 
            branch: "", phase: "failed", currentTaskPath: null, completedTasks: [], 
            lastUpdate: new Date().toISOString(), stats: null
          });
        }
      }
      return sequences.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
    }

    export function getTaskDetails(stateDir: string, logsDir: string, taskId: string): TaskDetails | null {
      const stateFile = path.join(stateDir, `${taskId}.state.json`);
      if (!fs.existsSync(stateFile)) return null;
      try {
        const content = fs.readFileSync(stateFile, "utf8");
        const state = JSON.parse(content);
        const fileStat = fs.statSync(stateFile);
        
        // Construct TaskDetails object, inheriting all properties from `state`
        // and adding `logs`. This now aligns with the TaskDetails interface extending TaskStatus.
        const taskDetails: TaskDetails = {
          ...state, // Spread all properties from the parsed state
          taskId: state.taskId || taskId, // Ensure taskId is set, fallback to param
          taskPath: state.taskPath || "unknown", // Fallback for older states
          startTime: state.startTime || new Date(fileStat.birthtime).toISOString(), // Fallback
          branch: state.branch || "",
          currentStep: state.currentStep || "",
          phase: state.phase || "pending",
          steps: state.steps || {},
          tokenUsage: state.tokenUsage || {},
          stats: state.stats || null,
          lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
          interactionHistory: state.interactionHistory || [],
          // The 'logs' property is specific to TaskDetails, not in core TaskStatus
          logs: {} // Initialize logs as an empty object
        };

        const taskLogDir = path.join(logsDir, taskId);
        if (fs.existsSync(taskLogDir)) {
          const logFiles = fs.readdirSync(taskLogDir);
          const stepLogs: { [stepName: string]: any } = {};
          for (const logFile of logFiles) {
            const match = logFile.match(/^\d+-(.+?)\.(log|reasoning\.log|raw\.json\.log)$/);
            if (match) {
              const [, stepName, logType] = match;
              if (!stepLogs[stepName]) stepLogs[stepName] = {};
              if (logType === "log") stepLogs[stepName].log = logFile;
              else if (logType === "reasoning.log") stepLogs[stepName].reasoning = logFile;
              else if (logType === "raw.json.log") stepLogs[stepName].raw = logFile;
            }
          }
          taskDetails.logs = stepLogs;
        }
        return taskDetails;
      } catch (error) {
        console.error(`Error reading task details for ${taskId}:`, error);
        return null;
      }
    }

    export function readLogFile(logsDir: string, taskId: string, logFile: string): string | null {
      const sanitizedTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "");
      const sanitizedLogFile = logFile.replace(/[^a-zA-Z0-9._-]/g, "");
      if (!sanitizedLogFile.match(/\.(log|reasoning\.log|raw\.json\.log)$/)) return null;
      const logPath = path.join(logsDir, sanitizedTaskId, sanitizedLogFile);
      const expectedDir = path.join(logsDir, sanitizedTaskId);
      if (!path.resolve(logPath).startsWith(path.resolve(expectedDir))) return null;
      try {
        if (!fs.existsSync(logPath)) return null;
        return fs.readFileSync(logPath, "utf8");
      } catch (error) {
        console.error(`Error reading log file ${logPath}:`, error);
        return null;
      }
    }

    export function findParentSequence(stateDir: string, taskId: string): SequenceInfo | null {
      const taskStateFile = path.join(stateDir, `${taskId}.state.json`);
      if (!fs.existsSync(taskStateFile)) return null;
      try {
        const content = fs.readFileSync(taskStateFile, 'utf-8');
        const taskState = JSON.parse(content);
        if (!taskState.parentSequenceId) return null;
        const sequenceStateFile = path.join(stateDir, `${taskState.parentSequenceId}.state.json`);
        if (!fs.existsSync(sequenceStateFile)) return null;
        const sequenceContent = fs.readFileSync(sequenceStateFile, 'utf-8');
        const sequenceState = JSON.parse(sequenceContent);
        const folderName = sequenceState.sequenceId?.replace('sequence-', '');
        return {
          sequenceId: sequenceState.sequenceId,
          phase: sequenceState.phase, // This 'phase' is now directly compatible with the imported Phase
          folderPath: folderName,
          branch: sequenceState.branch
        };
      } catch (error) {
        console.error('Error finding parent sequence:', error);
        return null;
      }
    }

    export function getSequenceDetails(stateDir: string, config: any, sequenceId: string): SequenceDetails | null {
      const stateFile = path.join(stateDir, `${sequenceId}.state.json`);
      if (!fs.existsSync(stateFile)) return null;
      try {
        const content = fs.readFileSync(stateFile, "utf8");
        const state = JSON.parse(content);
        const fileStat = fs.statSync(stateFile);
        const folderName = state.sequenceId?.replace('sequence-', '');
        if (!folderName) return null;
        
        // Construct SequenceDetails object, inheriting all properties from `state`
        // and adding the `tasks` array. This now aligns with the SequenceDetails interface.
        const sequenceDetails: SequenceDetails = {
          ...state, // Spread all properties from the parsed state
          sequenceId: state.sequenceId || sequenceId,
          startTime: state.startTime || new Date(fileStat.birthtime).toISOString(),
          branch: state.branch || "",
          phase: state.phase || "pending",
          currentTaskPath: state.currentTaskPath || null,
          completedTasks: state.completedTasks || [],
          lastUpdate: state.lastUpdate || fileStat.mtime.toISOString(),
          stats: state.stats || null,
          tasks: [] // Initialize tasks as an empty array
        };

        const allStateFiles = fs.readdirSync(stateDir).filter(f => f.endsWith('.state.json') && !f.startsWith('sequence-'));
        for (const stateFileName of allStateFiles) {
          try {
            const taskStateContent = fs.readFileSync(path.join(stateDir, stateFileName), 'utf8');
            const taskState = JSON.parse(taskStateContent);
            if (taskState.parentSequenceId === sequenceId) {
              const taskPhase: Phase = taskState.phase || 'pending'; // Use imported Phase type
              let taskStatus: Phase;

              // We check if the phase from the file is a valid, known status.
              if (taskPhase && ALL_STATUS_PHASES.includes(taskPhase as any)) {
                // If it's valid, we can safely cast it and use it.
                taskStatus = taskPhase;
              } else {
                // If it's missing, null, or an unknown value, we default to 'failed'
                // to make the problem visible in the UI and log a warning.
                if (taskPhase) { // Only log if there was an invalid value
                  console.warn(`Unknown task phase encountered: '${taskPhase}'. Defaulting to 'failed'.`);
                }
                taskStatus = 'failed';
              }

              const taskPath = taskState.taskPath || 'unknown';
              sequenceDetails.tasks.push({
                taskId: taskState.taskId || stateFileName.replace('.state.json', ''),
                taskPath: taskPath,
                filename: path.basename(taskPath),
                status: taskStatus,
                phase: taskState.phase,
                lastUpdate: taskState.lastUpdate
              });
            }
          } catch (e) { console.error(`Error reading task state ${stateFileName}:`, e); }
        }
        sequenceDetails.tasks.sort((a, b) => a.taskPath.localeCompare(b.taskPath));
        return sequenceDetails;
      } catch (error) {
        console.error(`Error reading sequence details for ${sequenceId}:`, error);
        return null;
      }
    }

    export function findLastStepName(taskDetails: TaskDetails): string | null {
      if (!taskDetails.steps || Object.keys(taskDetails.steps).length === 0) {
        return null;
      }

      let lastDoneStepName: string | null = null;

      // Iterate over the entries (key-value pairs) of the steps object
      for (const [stepName, stepStatus] of Object.entries(taskDetails.steps)) {
        const primaryStates = ['running', 'interrupted', 'failed', 'waiting_for_input'];

        // Check if the current stepStatus is one of the primary (active) states
        if (primaryStates.includes(stepStatus)) {
          return stepName; // Return the name of the active step immediately
        }

        if (stepStatus === 'done') {
          lastDoneStepName = stepName; // Keep track of the last completed step
        }
      }

      // If no active step was found, return the last completed one.
      return lastDoneStepName;
    }

    // Helper function to find the currently active task from journal events
    export function findActiveTaskFromJournal(journal: JournalEvent[]): JournalEvent | null {
      // Use a Map to track tasks that have started but not yet finished.
      // The key is the task ID, the value is the 'task_started' event object.
      const activeTasks = new Map<string, JournalEvent>();

      for (const event of journal) {
        if (event.eventType === 'task_started') {
          // When a task starts, add it to our set of active tasks.
          // If the same task ID was active before (from a failed run), this updates it
          // to the latest "started" event, which is correct.
          activeTasks.set(event.id, event);
        } else if (event.eventType === 'task_finished') {
          // When a task finishes, it's no longer active. Remove it from the map.
          activeTasks.delete(event.id);
        }
      }

      // If there are any tasks left in the map after processing the whole journal,
      // they are the ones that are currently running.
      if (activeTasks.size > 0) {
        // The map preserves insertion order. The "last" value in the map is the
        // most recently started, currently active task.
        // We convert the map values to an array and return the last element.
        return Array.from(activeTasks.values()).pop() || null;
      }

      return null; // No active tasks found.
    }

    /**
     * Finds the most recently finished task from the journal.
     */
    export function findLastFinishedTaskFromJournal(journal: JournalEvent[]): JournalEvent | null {
      // Iterate backwards through the journal to find the newest event first.
      for (let i = journal.length - 1; i >= 0; i--) {
        const event = journal[i];
        if (event.eventType === 'task_finished') {
          return event; // Found the most recent finished task.
        }
      }
      return null; // No finished tasks in the journal.
    }

    /**
     * Builds task history from journal events, maintaining chronological accuracy.
     * Enriches with details from state files when available.
     */
    export function buildTaskHistoryFromJournal(journal: JournalEvent[], stateDir: string): TaskStatus[] {
      const taskMap = new Map<string, TaskStatus>();

      // Process journal events chronologically to build task states
      for (const event of journal) {
        if (event.eventType === 'task_started') {
          // Create a minimal TaskStatus object. The rest will be filled by state file.
          taskMap.set(event.id, {
            version: 1, taskId: event.id, taskPath: "unknown", 
            startTime: event.timestamp, branch: "", currentStep: "", 
            phase: "running", steps: {}, tokenUsage: {}, stats: null, 
            lastUpdate: event.timestamp, interactionHistory: [],
            parentSequenceId: event.parentId
          });
        } else if (event.eventType === 'task_finished') {
          const existingTask = taskMap.get(event.id);
          if (existingTask) {
            existingTask.phase = event.status || 'done';
            existingTask.lastUpdate = event.timestamp;
          }
        }
      }

      // Enrich with details from state files
      const enrichedTasks: TaskStatus[] = [];
      for (const [taskId, taskStatus] of taskMap.entries()) {
        const stateFile = path.join(stateDir, `${taskId}.state.json`);
        if (fs.existsSync(stateFile)) {
          try {
            const content = fs.readFileSync(stateFile, "utf8");
            const state = JSON.parse(content);
            // Merge journal data (authoritative phase/timestamp) with state file data
            enrichedTasks.push({
              ...state, // All properties from the state file
              ...taskStatus, // Overwrite with authoritative journal data if present (phase, lastUpdate)
              // Ensure mandatory properties are not undefined from older states
              version: state.version || 1,
              taskPath: state.taskPath || "unknown",
              startTime: state.startTime || taskStatus.startTime,
              branch: state.branch || "",
              currentStep: state.currentStep || "",
              steps: state.steps || {},
              tokenUsage: state.tokenUsage || {},
              stats: state.stats || null,
              interactionHistory: state.interactionHistory || []
            });
          } catch (error) {
            console.error(`Error reading state file for ${taskId}:`, error);
            enrichedTasks.push(taskStatus); // Push minimal taskStatus from journal
          }
        } else {
          enrichedTasks.push(taskStatus);
        }
      }

      // Sort by lastUpdate descending (most recent first)
      return enrichedTasks.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
    }

    /**
     * Builds sequence history from journal events, maintaining chronological accuracy.
     * Enriches with details from state files when available.
     */
    export function buildSequenceHistoryFromJournal(journal: JournalEvent[], stateDir: string): SequenceStatus[] {
      const sequenceMap = new Map<string, SequenceStatus>();

      // Process journal events chronologically to build sequence states
      for (const event of journal) {
        if (event.eventType === 'sequence_started') {
          sequenceMap.set(event.id, {
            version: 1, sequenceId: event.id, startTime: event.timestamp,
            branch: "", phase: "running", currentTaskPath: null, 
            completedTasks: [], lastUpdate: event.timestamp, stats: null
          });
        } else if (event.eventType === 'sequence_finished') {
          const existingSequence = sequenceMap.get(event.id);
          if (existingSequence) {
            existingSequence.phase = event.status || 'done';
            existingSequence.lastUpdate = event.timestamp;
          }
        }
      }

      // Enrich with details from state files
      const enrichedSequences: SequenceStatus[] = [];
      for (const [sequenceId, sequenceStatus] of sequenceMap.entries()) {
        const stateFile = path.join(stateDir, `${sequenceId}.state.json`);
        if (fs.existsSync(stateFile)) {
          try {
            const content = fs.readFileSync(stateFile, "utf8");
            const state = JSON.parse(content);
            const folderName = state.sequenceId?.replace('sequence-', '');
            enrichedSequences.push({
              ...state, // All properties from the state file
              ...sequenceStatus, // Overwrite with authoritative journal data (phase, lastUpdate)
              // Ensure mandatory properties are not undefined
              version: state.version || 1,
              startTime: state.startTime || sequenceStatus.startTime,
              branch: state.branch || "",
              currentTaskPath: state.currentTaskPath || null,
              completedTasks: state.completedTasks || [],
              stats: state.stats || null,
              folderPath: folderName, // This is derived/added locally, not part of core status
            });
          } catch (error) {
            console.error(`Error reading sequence state file for ${sequenceId}:`, error);
            enrichedSequences.push(sequenceStatus); // Push minimal sequenceStatus from journal
          }
        } else {
          enrichedSequences.push(sequenceStatus);
        }
      }

      // Sort by lastUpdate descending (most recent first)
      return enrichedSequences.sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
    }
    ```

---

### 2. Centralize Live Activity State Management

*   **Objective:** Consolidate client-side logic for tracking task phase and triggering page reloads within `src/public/js/dashboard.js`. This prevents race conditions and ensures consistent behavior.

*   **Task:** Modify `src/public/js/dashboard.js`.

    1.  **Add `this.currentTaskPhase = null;` to the `CatHerderDashboard` constructor.**
        Find this block (around line 3 in `dashboard.js`):
        ```javascript
        class CatHerderDashboard {
            constructor() {
                this.websocket = null;
                this.reconnectInterval = 5000;
                this.currentWatchedLogFile = null;
            }
        ```
        Add the line:
        ```javascript
        class CatHerderDashboard {
            constructor() {
                this.websocket = null;
                this.reconnectInterval = 5000;
                this.currentWatchedLogFile = null;
                this.currentTaskPhase = null; // <--- ADD THIS LINE
            }
        ```

    2.  **Replace the *entire content* of the `handleRealtimeUpdate(data)` method.**
        Find this block (around line 25 in `dashboard.js`):
        ```javascript
        handleRealtimeUpdate(data) {
            // ... existing switch statement and logic ...
        }
        ```
        Replace it with this new, comprehensive code:
        ```javascript
        handleRealtimeUpdate(data) {
            switch (data.type) {
                case 'task_update':
                    const oldTaskPhase = this.currentTaskPhase; // Get phase before update
                    this.currentTaskPhase = data.data.phase; // ALWAYS update the internal phase tracker
                    const newTaskPhase = this.currentTaskPhase;

                    // Only perform reloads if we are currently on the /live page
                    if (window.location.pathname.endsWith('/live')) {
                        // Scenario 1: Critical phase transition (running <-> waiting_for_input)
                        // This forces a full re-render for UI consistency
                        if ((oldTaskPhase === 'running' && newTaskPhase === 'waiting_for_input') ||
                            (oldTaskPhase === 'waiting_for_input' && newTaskPhase === 'running')) {
                            console.log(`Phase changed from '${oldTaskPhase}' to '${newTaskPhase}'. Reloading Live Activity page.`);
                            window.location.reload();
                            return; // Stop further processing to allow reload
                        }

                        // Scenario 2: Current step has changed for an active task
                        // This handles cases where AI moves to a new step, or the page wasn't refreshed initially.
                        // We must ensure the currentTaskInView is defined and matches the updated task.
                        const currentTaskInView = window.liveActivityData?.runningTask;
                        if (currentTaskInView && currentTaskInView.taskId === data.data.taskId &&
                            currentTaskInView.currentStep !== data.data.currentStep &&
                            (newTaskPhase === 'running' || newTaskPhase === 'waiting_for_input')) {
                            console.log(`Current step changed from '${currentTaskInView.currentStep}' to '${data.data.currentStep}'. Reloading Live Activity page.`);
                            window.location.reload();
                            return; // Stop further processing to allow reload
                        }
                        
                        // Scenario 3: Task has finished, failed, or interrupted (and was live)
                        // This ensures the page refreshes to show the final state or redirects.
                        if (window.liveActivityData.isLive && newTaskPhase !== 'running' && newTaskPhase !== 'waiting_for_input') {
                            console.log(`Task phase changed from 'running/waiting_for_input' to '${newTaskPhase}'. Reloading to show final state.`);
                            setTimeout(() => window.location.reload(), 1200);
                            return; // Stop further processing to allow reload
                        }
                    }
                    
                    // If no reload was triggered, proceed with normal UI updates (e.g., status badge, minor info)
                    // This is important for updates on other pages (e.g., history) and minor updates on live page
                    this.updateTaskUI(data.data);
                    break;
                case 'sequence_update':
                    // Update sequence UI. If the sequence finishes, redirect from live page.
                    this.updateSequenceUI(data.data);
                    if (window.location.pathname.endsWith('/live')) {
                        if (['done', 'failed', 'interrupted'].includes(data.data.phase)) {
                            console.log(`Sequence finished. Redirecting to history.`);
                            setTimeout(() => window.location.href = '/history', 1500);
                            return;
                        }
                    }
                    break;
                case 'journal_updated':
                    console.log('\'journal_updated\' event handled. Current path:', window.location.pathname);
                    // Only reload history or root page when journal updates, unless sequence finishes (handled above)
                    // This is for ensuring history is up-to-date, not for active live logs
                    if (window.location.pathname.endsWith('/history') || window.location.pathname === '/') {
                        console.log('Path is /history or /, attempting page reload...');
                        window.location.reload();
                    }
                    break;
                case 'log_content':
                case 'log_update':
                case 'error':
                    // These are handled by handleLogUpdate directly, no need for reload here
                    this.handleLogUpdate(data);
                    break;
            }
        }
        ```

    3.  **Remove redundant reload logic from `updateTaskUI(task)` method.**
        Find this block (around line 73 in `dashboard.js` with previous changes):
        ```javascript
        if (window.location.pathname.endsWith('/live')) {
            const runningTask = window.liveActivityData?.runningTask;
            if (!runningTask) return;
            
            // --- NEW RELOAD LOGIC ---
            // If the incoming update is for the currently running task,
            // check if the step has changed. If so, reload the page
            // to update the entire sidebar and status headers.
            if (runningTask.taskId === task.taskId && runningTask.currentStep !== task.currentStep) {
                console.log(`Step changed from '${runningTask.currentStep}' to '${task.currentStep}'. Reloading.`);
                window.location.reload();
                return; // Stop further processing
            }
            // --- END NEW LOGIC ---

            // This part handles the log switching when a step changes,
            // which will now run after a page reload.
            const newStep = task.currentStep;
            // ... rest of the method ...
        }
        ```
        **Delete the entire `if (runningTask.taskId === task.taskId ...)` block, including the `return;` statement inside it.**
        Your `updateTaskUI` method should then look like this:
        ```javascript
        updateTaskUI(task) {
            // This part updates the history page badge in real-time
            const taskRow = document.querySelector(`[data-task-id="${task.taskId}"]`);
            if (taskRow) {
                this.updateStatusBadge(taskRow.querySelector('.task-status-badge'), task.phase);
            }

            if (window.location.pathname.endsWith('/live')) {
                const runningTask = window.liveActivityData?.runningTask;
                if (!runningTask) return;
                
                // This part handles the log switching when a step changes,
                // which will now run after a page reload.
                const newStep = task.currentStep;
                const newLogFile = task.logs?.[newStep]?.reasoning;

                if (newLogFile && this.currentWatchedLogFile !== newLogFile) {
                    console.log(`Switching log watch to ${newLogFile}`);
                    this.currentWatchedLogFile = newLogFile;
                    this.watchLogFile(task.taskId, newLogFile);
                }

                // Update status indicators for waiting_for_input phase
                if (task.phase === 'waiting_for_input') {
                    this.updateWaitingForInputUI(task);
                }

                // Existing logic to reload when the task is finished
                if (window.liveActivityData.isLive && task.phase !== 'running' && task.phase !== 'waiting_for_input') {
                    console.log(`Task phase changed from 'running' to '${task.phase}'. Reloading to show final state.`);
                    setTimeout(() => window.location.reload(), 1200);
                }
            }
        }
        ```

    4.  **Initialize `this.currentTaskPhase` in `initializeLiveView(runningTask)` method.**
        Find this block (around line 52 in `dashboard.js` with previous changes):
        ```javascript
        initializeLiveView(runningTask) {
            if (!runningTask) {
                console.log("Live view initialized, no task is currently running.");
                return;
            }
            // Trigger the first UI update and log watch.
            this.updateTaskUI(runningTask);
        }
        ```
        Add the line `this.currentTaskPhase = runningTask.phase;` before `this.updateTaskUI(runningTask);`:
        ```javascript
        initializeLiveView(runningTask) {
            if (!runningTask) {
                console.log("Live view initialized, no task is currently running.");
                return;
            }
            // Initialize currentTaskPhase from the initial render's task data
            this.currentTaskPhase = runningTask.phase; // <--- ADD THIS LINE
            // Trigger the first UI update and log watch.
            this.updateTaskUI(runningTask);
        }
        ```

---

### 3. Simplify Live Activity Page Initialization

*   **Objective:** Streamline `src/public/js/live-activity-page.js` to avoid redundant WebSocket message handling and rely solely on `dashboard.js` for reactive behavior.

*   **Task:** **Replace the entire content of `src/public/js/live-activity-page.js`** with the simplified code below.

*   **Code Snippet (`src/public/js/live-activity-page.js` - COMPLETE REPLACEMENT):**
    ```javascript
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize the main WebSocket connection for the dashboard.
        // This will be responsible for handling all real-time updates through dashboard.js.
        window.dashboard.initWebSocket();
        
        // After the WebSocket is initialized, tell the dashboard to set up
        // the live view, passing the initial data rendered by the server.
        if (window.dashboard && typeof window.dashboard.initializeLiveView === 'function') {
            const initialData = window.liveActivityData || {};
            window.dashboard.initializeLiveView(initialData.runningTask);
        }
    });
    ```

---

### 4. Verify End-to-End Behavior

*   **Objective:** Confirm that the live activity page functions as expected through all interactive halting scenarios and general task progression.

*   **Task:**
    1.  **Rebuild your project:** Run `npm run build`.
    2.  **Restart your web dashboard:** Run `npm run cat-herder:web`.
    3.  **Start a task** that is known to require human interaction (ensure `interactionThreshold` is greater than 0 in its frontmatter or `cat-herder.config.js`).
    4.  **Open the `/live` page** in your web browser.
    5.  **Observe the initial state:** The log stream for the current step should be immediately visible, not "Connecting...".
    6.  **When the AI asks a question:**
        *   The page should reload.
        *   The logs for the current (asking) step should be immediately visible.
        *   The question card should appear with the AI's question.
    7.  **Submit an answer** via the web UI.
        *   The page should reload.
        *   The logs for the *resuming* step (or next step if it moved on immediately) should be visible and continue to stream live updates.
    8.  **Observe task progression:** As the AI moves to subsequent steps, the page should reload, updating the sidebar context and showing the new step's logs.
    9.  **Task completion:** When the task finishes, the page should reload to display the final task status, or redirect to the history page if part of a sequence.

---

### 5. Update Documentation

*   **Objective:** Ensure `README.md` and `ARCHITECTURE.MD` reflect the current stable implementation of interactive halting and live activity.

*   **Task:**
    *   Review `README.md`'s "Interactive Web Dashboard" and "Interactive Halting" sections to confirm they accurately describe the now-working functionality. No substantial changes are likely needed, as the previous documentation already envisioned this behavior.
    *   Review `ARCHITECTURE.MD`'s descriptions of the "Web Dashboard" and "State-Based Signal Detection" (particularly how web UI interactions are handled) to confirm they are still accurate. Again, no major structural changes, primarily behavioral refinement.

---

This detailed plan should guide you through fixing the remaining issues. Please proceed carefully with each step and let me know the outcome of your tests!