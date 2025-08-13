1. State Files (.claude/state/)

  Task State (`<task-id>.state.json`):

  When a user interrupts a task, the state file should be updated to reflect this.

    1 {
    2   "taskId": "my-feature-task",
    3   "startTime": "2025-08-13T19:00:00.000Z",
    4   "phase": "interrupted",
    5   "currentStep": "implement",
    6   "steps": {
    7     "plan": "done",
    8     "write_tests": "done",
    9     "implement": "interrupted"
   10   },
   11   "branch": "claude/my-feature-task",
   12   "pipeline": "default",
   13   "lastUpdate": "2025-08-13T19:05:22.123Z"
   14 }

  Key Changes:

   * phase:  Set to "interrupted". This is a new state that clearly indicates why the process is not running.
   * steps.implement: The currently running step is also marked as "interrupted".

  Sequence State (`<sequence-id>.state.json`):

  Similarly, the sequence state should also reflect the interruption.

    1 {
    2   "sequenceId": "my-feature-sequence",
    3   "startTime": "2025-08-13T18:00:00.000Z",
    4   "phase": "interrupted",
    5   "currentTaskPath": "/Users/clairebesset/claude-project/claude-Tasks/my-feature/02-implement.md",
    6   "completedTasks": [
    7     "/Users/clairebesset/claude-project/claude-Tasks/my-feature/01-plan.md"
    8   ],
    9   "branch": "claude/my-feature-sequence",
   10   "stats": null,
   11   "lastUpdate": "2025-08-13T19:05:22.123Z"
   12 }

  Key Changes:

   * phase: Set to "interrupted".

  2. Log Files (.claude/logs/)

  Reasoning Log (`XX-step-name.reasoning.log`):

  The reasoning log for the interrupted step should have a clear message indicating the interruption.

   1 ... (previous log entries)
   2 [2025-08-13 19:05:22] [SYSTEM] [INTERRUPT] User interrupted the process.
   3 =================================================
   4 --- Process interrupted at: 2025-08-13T19:05:22.123Z ---
   5 =================================================

  Key Changes:

   * A clear log message indicating the user interruption.
   * A footer indicating when the process was interrupted.

  Regular Log (`XX-step-name.log`):

  The regular log file should also have a similar message.

   1 ... (previous log entries)
   2 
   3 [Orchestrator] User interrupted the process.
   4 
   5 -------------------------------------------------
   6 --- Process interrupted at: 2025-08-13T19:05:22.123Z ---
   7 -------------------------------------------------

  3. Restarting the Process

  When the user restarts the same command (claude-project run ... or claude-project run-sequence ...), the orchestrator will:

   1. Read the state file and see that the phase is "interrupted".
   2. Log a message to the console indicating that it's resuming an interrupted task/sequence.
   1     [Orchestrator] Resuming interrupted task: "my-feature-task"
   3. Restart the execution from the beginning of the interrupted step (implement in this example).
   4. The log files for the resumed step will have a clear header indicating that it's a resumed execution.

  Reasoning Log (`XX-step-name.reasoning.log`) on Restart:

   1 =================================================
   2   Resuming Interrupted Attempt at: 2025-08-13T20:00:00.000Z
   3   Command: claude /project:implement ...
   4   Pipeline: default
   5   Model: claude-3-opus-20240229
   6   Settings: { ... }
   7 =================================================
   8 --- This file contains Claude's step-by-step reasoning process ---
   9 ... (new log entries)

  Implementation Approach (High-Level)

  To achieve this, I would:

   1. Trap Interrupt Signals: In orchestrator.ts, I would add a listener for the SIGINT signal (which is sent when the user presses Ctrl+C).
   2. Graceful Shutdown: In the signal handler, I would:
       * Update the task and sequence state files to set the phase to "interrupted".
       * Write the interruption message to the log files.
       * Kill the spawned claude process.
       * Exit the main process.
   3. Resumption Logic: In the runTask and runTaskSequence functions, I would add logic to check for the "interrupted" phase in the state file and resume accordingly.

  This approach would provide a robust and user-friendly way to handle interruptions, making the entire process more resilient and transparent.
