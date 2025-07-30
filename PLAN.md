

# PLAN.md

### **Title & Goal**

**Title:** Enhance Hook Logging to Include Reasoning Files

**Goal:** Capture and log `stderr` output from `PreToolUse` hooks into the corresponding step's `.reasoning.log` file to provide a complete debugging trail.

### **Description**

Currently, when a `PreToolUse` hook (like the file access guardrail) blocks a tool, its error message is printed to the console and the main `.log` file, but it's missing from the `.reasoning.log`. This creates a gap in the AI's "thought process," making it difficult to understand precisely why it retried a command.

This change will pipe the `stderr` from the `claude` CLI process (which includes hook output) into the reasoning log. The new behavior will ensure a single, chronological log file contains both the AI's reasoning *and* the system's automated feedback, streamlining the debugging process.

### **Summary Checklist**

-   [x] **`proc.ts`:** Update the `stderr` handler in the `runStreaming` function to also write to the reasoning log stream.
-   [ ] **Manual Test:** Verify the new logging behavior by intentionally triggering a hook failure.
-   [ ] **Documentation:** Update the `README.md` to reflect that reasoning logs now include hook output.

### **Detailed Implementation Steps**

#### 1. Update `proc.ts` to Capture Hook Output

*   **Objective:** Modify the core process runner to pipe any `stderr` data from the child process to the reasoning log file, in addition to its current destinations.
*   **Task:**
    1.  Open the file `src/tools/proc.ts`.
    2.  Locate the `runStreaming` function.
    3.  Find the `p.stderr.on('data', ...)` event handler within that function.
    4.  Add a single line to write the incoming `chunk` to the `reasoningStream` if it has been created.

*   **Code Snippet (`src/tools/proc.ts`):**

    ```typescript
    // ... inside the runStreaming function's Promise ...

    p.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
      
      // ADD THIS LINE
      if (reasoningStream) {
        reasoningStream.write(chunk);
      }
      
      fullOutput += chunk.toString();
    });

    // ... rest of the function
    ```

#### 2. Manually Verify the Change

*   **Objective:** Confirm that the hook's error message is now correctly appearing in the `.reasoning.log` file.
*   **Task:**
    1.  Ensure you have a pipeline step that uses the `fileAccess` guardrail, like the default `plan` step which only allows writing to `PLAN.md`.
    2.  Temporarily modify the `src/dot-claude/commands/plan-task.md` prompt to explicitly instruct Claude to write to a disallowed file (e.g., `PLAN_test.md`).
    3.  Run a task, for example: `npm run claude:run claude-Tasks/task-001-sample.md`.
    4.  The first attempt should fail and be blocked by the hook.
    5.  Inspect the generated log file at `.claude/logs/<your-task-id>/01-plan.reasoning.log`.
    6.  **Verification:** The log should now contain the `[Guardrail] Blocked:` error message, followed by Claude's next reasoning step where it acknowledges the error.
    7.  Remember to revert the changes to `plan-task.md` after verification.

#### 3. Update Project Documentation

*   **Objective:** Clearly document the new, enhanced logging behavior in the main `README.md` file so users know where to look for debugging information.
*   **Task:**
    1.  Open `README.md`.
    2.  Navigate to the "### Debugging and Logs" section.
    3.  Update the description for the `.reasoning.log` file.
*   **Text Changes (`README.md`):**
    *   **Current Text:** "Contains the AI's detailed reasoning process. This shows the step-by-step thinking that led to the final output."
    *   **New Text:** "Contains the AI's detailed reasoning process (its "chain of thought"). This shows the internal thinking that led to the final output. **Crucially, it also includes the output from any configured command hooks, such as error messages from file access guardrails.** This provides a complete, chronological record of the AI's attempts and the system's feedback, making it the best place to start debugging."

### **Error Handling & Warnings**

*   The implementation should be defensive. The code change in `proc.ts` must check if `reasoningStream` exists before attempting to write to it. This prevents crashes in any scenario where a reasoning log is not configured.
*   No new CLI warnings or user-facing errors are expected from this change. The primary effect is a richer and more informative log file.