# Plan: Enhance Logging and State Management

**Goal:** To improve the logging and state management capabilities of the `claude-project` CLI to provide better debugging, observability, and more accurate state representation.

## Description

The current logging and state management system lacks some crucial information and has some inconsistencies. This plan outlines the necessary changes to enrich the log files, improve the accuracy of state files, and add valuable statistics to the sequence state.

**Current Behavior:**
*   Log files are missing context like the pipeline, model, and settings used.
*   Log files do not have clear start and end timestamps.
*   State files for sequences and tasks are missing start times.
*   There are discrepancies between the sequence and task state files regarding the current step and branch name.
*   The sequence state file does not provide any summary statistics.

**New Behavior:**
*   Log files will include the pipeline name, model, a sanitized version of the project settings, and clear start/end timestamps.
*   State files for sequences and tasks will include a `startTime` field.
*   The sequence state file will accurately reflect the task's status (e.g., `waiting_for_reset`).
*   The sequence state file will correctly show that no branch is used when git branch management is disabled.
*   The sequence state file will include a `stats` section with total duration (including and excluding pauses) and total pause time.

## Summary Checklist

- [x] **1. Enhance Log Files:** Modify `proc.ts` and `orchestrator.ts` to include more context in log files.
- [x] **2. Add Start Time to State Files:** Update `status.ts` and `orchestrator.ts` to include `startTime` in task and sequence state.
- [ ] **3. Fix State Discrepancies:** Adjust `orchestrator.ts` to ensure the sequence state accurately reflects the task state.
- [ ] **4. Add Stats to Sequence State:** Modify `orchestrator.ts` and `status.ts` to calculate and store statistics in the sequence state.
- [ ] **5. Update Documentation:** Update `README.md` to reflect the new features and changes.

## Detailed Implementation Steps

### 1. Enhance Log Files

*   **Objective:** To provide more context in the log files for easier debugging.
*   **Task:**
    1.  Modify the `runStreaming` function in `src/tools/proc.ts` to accept an `options` object containing `pipelineName` and `settings`.
    2.  Update the log header in `src/tools/proc.ts` to include this new information.
    3.  Update the `executeStep` function in `src/tools/orchestrator.ts` to pass the `pipelineName` and `config` to `runStreaming`.
    4.  Pass the `pipelineName` from `executePipelineForTask` down to `executeStep`.
*   **Code Snippet (proc.ts):**

    ```typescript
    // BEFORE
    export function runStreaming(
      cmd: string,
      args: string[],
      logPath: string,
      reasoningLogPath: string,
      cwd: string,
      stdinData?: string,
      rawJsonLogPath?: string,
      model?: string
    ): Promise<StreamResult> {

    // AFTER
    export interface RunStreamingOptions {
      pipelineName?: string;
      settings?: any;
    }

    export function runStreaming(
      cmd: string,
      args: string[],
      logPath: string,
      reasoningLogPath: string,
      cwd: string,
      stdinData?: string,
      rawJsonLogPath?: string,
      model?: string,
      options?: RunStreamingOptions
    ): Promise<StreamResult> {
    ```

### 2. Add Start Time to State Files

*   **Objective:** To track when a task or sequence was started.
*   **Task:**
    1.  Update the `TaskStatus` and `SequenceStatus` interfaces in `src/tools/status.ts` to include a `startTime` field (string, ISO format).
    2.  In `orchestrator.ts`, when a new task or sequence is initiated, set the `startTime` in the corresponding state file.
*   **Code Snippet (status.ts):**

    ```typescript
    // BEFORE
    export interface TaskStatus {
      taskId: string;
      // ...
    }

    // AFTER
    export interface TaskStatus {
      taskId: string;
      startTime: string;
      // ...
    }
    ```

### 3. Fix State Discrepancies

*   **Objective:** To ensure the sequence state is always in sync with the task state.
*   **Task:**
    1.  **Pause State:** In `orchestrator.ts`, when a task is paused due to rate limiting, update the sequence state's `phase` to `waiting_for_reset` as well.
    2.  **Branch Name:** In `orchestrator.ts`, when `manageGitBranch` is `false`, ensure the sequence state's `branch` is set to the current branch, consistent with the task state.

### 4. Add Stats to Sequence State

*   **Objective:** To provide performance metrics for sequences.
*   **Task:**
    1.  Add a `stats` field to the `SequenceStatus` interface in `src/tools/status.ts`.
    2.  The `stats` object will have `totalDuration`, `totalDurationExcludingPauses`, and `totalPauseTime` (all in seconds).
    3.  In `orchestrator.ts`, when a sequence completes, calculate these statistics and save them to the state file.
    4.  Track pause times by recording timestamps when a pause starts and ends.

### 5. Update Documentation

*   **Objective:** To document the new features for users.
*   **Task:**
    1.  Update the `README.md` file to describe the new information available in the log files.
    2.  Document the new fields in the state files and the new `stats` section in the sequence state.

## Error Handling & Warnings

*   The process will gracefully handle missing or malformed state files.
*   If the `startTime` is missing from an existing state file, it will be added on the next run.
*   No new warnings are anticipated for these changes.
