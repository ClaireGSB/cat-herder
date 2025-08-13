Of course. Here is a detailed `PLAN.md` that you can provide to a junior developer. It outlines the necessary changes to fix the stat inconsistencies and introduce stats for isolated tasks.

***

# PLAN.md

### **Title: Enhance and Fix Workflow Statistics**

**Goal:** To fix inconsistencies in sequence statistics and add comprehensive timing and usage stats to tasks run in isolation.

### **Description**

Currently, the powerful `stats` object (with `totalDuration`, `totalPauseTime`, etc.) is only generated for task sequences run via `run-sequence`. Tasks run in isolation with the `run` command do not produce these helpful metrics.

Furthermore, the existing sequence stats have two bugs:
1.  `totalPauseTime` is always `0` because the time spent waiting for API rate limit resets is not being tracked.
2.  The final aggregated `totalTokenUsage` is incorrectly reset to an empty object, losing valuable usage data.

This plan will address these issues by:
1.  **Fixing** the `totalPauseTime` and `totalTokenUsage` calculations for sequences.
2.  **Introducing** the same `stats` block to the state files of tasks run in isolation, providing consistent metrics across all workflow types.

### **Summary Checklist**

-   [ ] **Step 1:** Update State Interfaces and Defaults
-   [ ] **Step 2:** Implement Pause Time Tracking in the Orchestrator
-   [ ] **Step 3:** Fix Token Usage Aggregation in `runTaskSequence`
-   [ ] **Step 4:** Implement Final Stats Calculation for Isolated Tasks
-   [ ] **Step 5:** Write New Tests for Stats Calculation
-   [ ] **Step 6:** Update Documentation (`README.md`)

---

### **Detailed Implementation Steps**

#### **Step 1: Update State Interfaces and Defaults**

*   **Objective:** Add a `stats` property to the `TaskStatus` interface so that isolated tasks can store their own statistics, mirroring the structure used by sequences.
*   **Task:**
    1.  Navigate to `src/tools/status.ts`.
    2.  Locate the `SequenceStatus` interface and copy the `stats` property definition.
    3.  Paste this definition into the `TaskStatus` interface.
    4.  Update the `defaultStatus` constant to initialize the new `stats` property to `null`.
*   **Code Snippet (`src/tools/status.ts`):**

    ```typescript
    // BEFORE in TaskStatus
    export type TaskStatus = {
      // ... other properties
      tokenUsage: ModelTokenUsage;
      lastUpdate: string;
      prUrl?: string;
      lastCommit?: string;
    };

    // AFTER in TaskStatus
    export type TaskStatus = {
      // ... other properties
      tokenUsage: ModelTokenUsage;
      stats: { // ADD THIS ENTIRE BLOCK
        totalDuration: number;
        totalDurationExcludingPauses: number;
        totalPauseTime: number;
      } | null;
      lastUpdate: string;
      prUrl?: string;
      lastCommit?: string;
    };

    // Update the defaultStatus constant
    const defaultStatus: TaskStatus = {
        // ... other properties
        steps: {},
        tokenUsage: {},
        stats: null, // ADD THIS LINE
        lastUpdate: new Date().toISOString()
    };
    ```

#### **Step 2: Implement Pause Time Tracking in the Orchestrator**

*   **Objective:** Modify the core step execution logic to track pause durations whenever the tool waits for an API rate limit to reset.
*   **Task:**
    1.  Navigate to the `executeStep` function in `src/tools/orchestrator.ts`.
    2.  Find the `if (config.waitForRateLimitReset)` block that handles API rate limiting.
    3.  Inside this block, before the `await new Promise(...)` call, add logic to update the pause time in the state files. The `waitMs` variable holds the exact pause duration.
*   **Code Snippet (`src/tools/orchestrator.ts`):**

    ```typescript
    // Inside executeStep function's rateLimit handling block

    if (config.waitForRateLimitReset) {
      const waitMs = resetTime.getTime() - Date.now();
      if (waitMs > 0) {
        console.log(pc.yellow(`[Orchestrator] Claude API usage limit reached.`));

        // ... console logs ...

        console.log(pc.cyan(`  › Pausing and will auto-resume at ${resetTime.toLocaleTimeString()}.`));
        
        // --- ADD THIS LOGIC ---
        const pauseInSeconds = waitMs / 1000;
        updateStatus(statusFile, s => {
            s.phase = "waiting_for_reset";
            if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0 };
            s.stats.totalPauseTime += pauseInSeconds;
        });

        if (sequenceStatusFile) {
            updateSequenceStatus(sequenceStatusFile, s => {
                (s.phase as any) = "waiting_for_reset";
                if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0, totalTokenUsage: {} };
                s.stats.totalPauseTime += pauseInSeconds;
            });
        }
        // --- END OF NEW LOGIC ---

        await new Promise(resolve => setTimeout(resolve, waitMs));

        // ... resume logic ...
      }
    }
    ```

#### **Step 3: Fix Token Usage Aggregation in `runTaskSequence`**

*   **Objective:** Correct the logic at the end of a sequence run to ensure the aggregated `totalTokenUsage` is preserved in the final stats.
*   **Task:**
    1.  Navigate to the end of the `runTaskSequence` function in `src/tools/orchestrator.ts`.
    2.  Find the final `updateSequenceStatus` call that executes when the sequence is `done`.
    3.  Modify the assignment to the `stats` object to preserve the existing `totalTokenUsage`, which has been aggregated throughout the sequence.
*   **Code Snippet (`src/tools/orchestrator.ts`):**

    ```typescript
    // At the end of runTaskSequence function

    // BEFORE
    updateSequenceStatus(statusFile, s => { 
        s.phase = "done"; 
        const startTime = new Date(s.startTime).getTime();
        const endTime = new Date().getTime();
        const totalDuration = (endTime - startTime) / 1000;
        s.stats = {
            totalDuration,
            totalDurationExcludingPauses: totalDuration - totalPauseTime,
            totalPauseTime,
            totalTokenUsage: {} // This is the bug - it resets the tokens
        }
    });

    // AFTER
    updateSequenceStatus(statusFile, s => { 
        s.phase = "done"; 
        const startTime = new Date(s.startTime).getTime();
        const endTime = new Date().getTime();
        const totalDuration = (endTime - startTime) / 1000;
        // Ensure stats object exists and preserve token usage
        if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0, totalTokenUsage: {} };
        const existingTokenUsage = s.stats.totalTokenUsage;
        const totalPauseTime = s.stats.totalPauseTime; // Get the tracked pause time

        s.stats = {
            totalDuration,
            totalDurationExcludingPauses: totalDuration - totalPauseTime,
            totalPauseTime,
            totalTokenUsage: existingTokenUsage // This is the fix
        }
    });
    ```

#### **Step 4: Implement Final Stats Calculation for Isolated Tasks**

*   **Objective:** Calculate and save the final timing statistics for a task when it is run in isolation via `claude-project run`.
*   **Task:**
    1.  Navigate to the `runTask` function in `src/tools/orchestrator.ts`.
    2.  After the `await executePipelineForTask(...)` call completes, add a new block of code to perform the final calculation and save it to the task's state file.
*   **Code Snippet (`src/tools/orchestrator.ts`):**

    ```typescript
    export async function runTask(taskRelativePath: string, pipelineOption?: string) {
      // ... existing code for validation and git branch management ...
    
      // 5. Execute the pipeline using the new reusable function
      const taskPath = path.resolve(projectRoot, taskRelativePath);
      await executePipelineForTask(taskPath, { pipelineOption });
    
      // --- ADD THIS ENTIRE BLOCK ---
      console.log(pc.cyan("\n[Orchestrator] Calculating final task statistics..."));
      updateStatus(statusFile, s => {
        if (s.phase === 'done') {
          const startTime = new Date(s.startTime).getTime();
          const endTime = new Date().getTime();
          const totalDuration = (endTime - startTime) / 1000;
          
          if (!s.stats) s.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0 };
          const totalPauseTime = s.stats.totalPauseTime;
    
          s.stats.totalDuration = totalDuration;
          s.stats.totalDurationExcludingPauses = totalDuration - totalPauseTime;
        }
      });
      console.log(pc.green("[Orchestrator] Task statistics saved."));
      // --- END OF NEW BLOCK ---
    }
    ```

#### **Step 5: Write New Tests for Stats Calculation**

*   **Objective:** Create automated tests to ensure the stats calculations are accurate and robust for both isolated tasks and sequences.
*   **Task:**
    1.  Create a new test file: `test/stats-calculation.test.ts`.
    2.  **Test Case 1: Isolated Task Stats.**
        *   Write a test that simulates running a single task pipeline.
        *   Mock the `runStreaming` function from `src/tools/proc.ts` to simulate a pause by returning a `rateLimit` object.
        *   After the simulated run, read the generated task state file.
        *   Assert that the `stats` object exists and that `totalPauseTime` and `totalDuration` are correct.
    3.  **Test Case 2: Sequence Stats.**
        *   Write a test that simulates a sequence with multiple tasks.
        *   Mock `runStreaming` to return different `tokenUsage` values for each step and a `rateLimit` object during one of the steps.
        *   After the sequence completes, read the generated sequence state file.
        *   Assert that `stats.totalTokenUsage` contains the sum of tokens from all steps.
        *   Assert that `stats.totalPauseTime` is correct.
 ##### **Key Principles for This Task**

1.  **Isolate the Orchestrator:** We are **not** testing the `claude` CLI, the file system, or Git. We are testing that our `runTask` and `runTaskSequence` functions in `src/tools/orchestrator.ts` correctly process data and update the state files.
2.  **Minimal, Targeted Mocks:** We will only mock the direct dependencies of the orchestrator. Our primary tool will be mocking `runStreaming` from `src/tools/proc.ts`. This function is the "gateway" to the outside world (the Claude CLI), and by controlling its return value, we can simulate any scenario (success, failure, rate limits, token usage) without running the actual CLI.
3.  **Control Time:** Since we are testing duration, we will use Vitest's fake timers (`vi.useFakeTimers`) to have complete, predictable control over the passage of time.
4.  **Use a Real (Temporary) File System:** We will write the actual state files to a temporary directory during tests. This is more reliable than mocking `fs` and directly tests the real output of our functions.

---

##### **New Test File: `test/stats-calculation.test.ts`**

###### **1. Setup and Mocks**

At the top of your new test file, you will set up the mocks and environment. This setup ensures every test runs in a clean, predictable state.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { runTask, runTaskSequence } from '../src/tools/orchestrator';
import { getConfig, getProjectRoot } from '../src/config';
import { runStreaming } from '../src/tools/proc';
import { execSync } from 'node:child_process';

// --- MOCK EXTERNAL DEPENDENCIES ---
// Mock the function that runs the actual 'claude' command. This is our main control point.
vi.mock('../src/tools/proc', () => ({
  runStreaming: vi.fn(),
}));

// Mock the config loader to return a predictable configuration for our tests.
vi.mock('../src/config', () => ({
  getConfig: vi.fn(),
  getProjectRoot: vi.fn(),
}));

// Mock execSync to prevent real Git commands from running.
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));


describe('Workflow Statistics Calculation', () => {
  const tempDir = path.resolve(__dirname, 'temp-test-stats');

  beforeEach(() => {
    // Use fake timers to control time during tests
    vi.useFakeTimers(); 

    // Create a fresh temporary directory for each test
    fs.ensureDirSync(tempDir);
    vi.mocked(getProjectRoot).mockReturnValue(tempDir);
    
    // Mock git commands to return default values
    vi.mocked(execSync).mockReturnValue('');
  });

  afterEach(() => {
    // Restore real timers and clean up mocks
    vi.useRealTimers();
    vi.restoreAllMocks();
    
    // Clean up the temporary directory
    fs.removeSync(tempDir);
  });

  // ... Tests will go here ...
});
```

###### **2. Test Case: Isolated Task with a Pause**

This test verifies that a single task run correctly calculates `totalPauseTime` and final durations.

*   **Objective:** Simulate a task where one step hits a rate limit. Assert that the final `stats` object in the task's state file reflects the pause.

```typescript
  it('should calculate and save stats including pause time for a single task', async () => {
    // --- ARRANGE ---
    // 1. Define a fake config that enables waiting for rate limits.
    const fakeConfig = {
      manageGitBranch: false,
      waitForRateLimitReset: true,
      statePath: '.claude/state',
      logsPath: '.claude/logs',
      pipelines: {
        default: [
          { name: 'plan', command: 'plan', check: { type: 'none' } },
          { name: 'implement', command: 'implement', check: { type: 'none' } },
        ],
      },
    };
    vi.mocked(getConfig).mockResolvedValue(fakeConfig as any);
    
    // 2. Create a dummy task file in our temp directory.
    const taskPath = path.join(tempDir, 'task-01.md');
    fs.writeFileSync(taskPath, '# My Task');

    // 3. Define the behavior of our mocked `runStreaming` function.
    const mockRunStreaming = vi.mocked(runStreaming);
    
    // First step ('plan') succeeds immediately with some token usage.
    mockRunStreaming.mockResolvedValueOnce({ code: 0, output: 'Success', tokenUsage: { input_tokens: 50, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });

    // Second step ('implement') simulates hitting a rate limit.
    // The reset timestamp is 30 seconds (30,000ms) in the future.
    const rateLimitResetTime = new Date(Date.now() + 30000);
    mockRunStreaming.mockResolvedValueOnce({ 
      code: 0, 
      output: 'Rate limited', 
      rateLimit: { resetTimestamp: rateLimitResetTime.getTime() / 1000 }
    });

    // After the pause, the 'implement' step runs again and succeeds.
    mockRunStreaming.mockResolvedValueOnce({ code: 0, output: 'Success again', tokenUsage: { input_tokens: 20, output_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });

    // --- ACT ---
    const startTime = new Date();
    vi.setSystemTime(startTime);

    const runPromise = runTask(taskPath); // Start the task
    
    // IMPORTANT: Advance the fake timer to simulate the 30-second pause.
    await vi.advanceTimersByTimeAsync(30000);

    await runPromise; // Wait for the entire task to complete.

    const finalTime = new Date();
    const expectedTotalDuration = (finalTime.getTime() - startTime.getTime()) / 1000;

    // --- ASSERT ---
    const stateFile = path.join(tempDir, '.claude/state/task-01.state.json');
    const status = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));

    expect(status.phase).toBe('done');
    expect(status.stats).not.toBeNull();
    expect(status.stats.totalPauseTime).toBeCloseTo(30);
    expect(status.stats.totalDuration).toBeCloseTo(expectedTotalDuration);
    expect(status.stats.totalDurationExcludingPauses).toBeCloseTo(expectedTotalDuration - 30);
    
    // Also verify token usage was recorded correctly for the task
    expect(status.tokenUsage.default.outputTokens).toBe(100 + 40);
  });
```

###### **3. Test Case: Sequence with Aggregated Tokens**

This test verifies the fix for `totalTokenUsage` aggregation in sequences.

*   **Objective:** Simulate a sequence of two tasks. Each step produces token usage. Assert that the final `stats.totalTokenUsage` in the sequence's state file is the *sum* of all usage across both tasks.

```typescript
  it('should correctly aggregate token usage across a multi-task sequence', async () => {
    // --- ARRANGE ---
    const fakeConfig = {
      manageGitBranch: false,
      statePath: '.claude/state',
      logsPath: '.claude/logs',
      pipelines: {
        default: [{ name: 'implement', command: 'implement', check: { type: 'none' } }],
      },
    };
    vi.mocked(getConfig).mockResolvedValue(fakeConfig as any);

    // Create a directory and two task files for the sequence.
    const sequenceFolder = path.join(tempDir, 'my-sequence');
    fs.ensureDirSync(sequenceFolder);
    fs.writeFileSync(path.join(sequenceFolder, '01-first.md'), '# First');
    fs.writeFileSync(path.join(sequenceFolder, '02-second.md'), '# Second');
    
    // Define the mock behavior for each step of each task.
    vi.mocked(runStreaming)
      // Task 1, Step 1 ('implement')
      .mockResolvedValueOnce({ code: 0, output: 'Success', tokenUsage: { output_tokens: 100, input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
      // Task 2, Step 1 ('implement')
      .mockResolvedValueOnce({ code: 0, output: 'Success', tokenUsage: { output_tokens: 250, input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });

    // --- ACT ---
    await runTaskSequence(sequenceFolder);

    // --- ASSERT ---
    const stateFile = path.join(tempDir, '.claude/state/sequence-my-sequence.state.json');
    const status = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));

    expect(status.phase).toBe('done');
    expect(status.stats).not.toBeNull();
    expect(status.stats.totalTokenUsage).toBeDefined();
    
    // THE KEY ASSERTION: Verify the sum is correct.
    expect(status.stats.totalTokenUsage.default.outputTokens).toBe(100 + 250); // 350
  });
```

#### **Step 6: Update Documentation (`README.md`)**

*   **Objective:** Update the project `README.md` to reflect that isolated tasks now also generate a `stats` object.
*   **Task:**
    1.  Open `README.md` for editing.
    2.  Find the section titled **"State Files"**.
    3.  Modify the description for the **Task State File** to include information about the new `stats` object.
*   **Code Snippet (for `README.md`):**

    **Current Text:**
    > **Task State File (`<task-id>.state.json`):**
    > This file contains the status of a single task. It now includes the `startTime` of the task.

    **New Text:**
    > **Task State File (`<task-id>.state.json`):**
    > This file contains the status of a single task. It includes the `startTime` of the task and a `stats` object with total duration and pause time metrics.

### **Error Handling & Warnings**

*   The code should gracefully handle cases where a `stats` object is `null` (e.g., in older state files or at the start of a run) by initializing it with default zero values before performing calculations.
*   No new CLI warnings are required. The changes enhance existing data structures without altering the user-facing workflow.