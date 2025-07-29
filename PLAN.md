

# PLAN.md

### **Title: Implement Chain of Thought (CoT) Logging**

**Goal:** To capture Claude's reasoning process into separate log files for better debugging and analysis, without cluttering the main output logs.

---

### **Description**

Currently, our tool only logs the final output from the `claude` CLI command. This makes it difficult to understand *why* the AI made a certain decision, as its "thinking" process (the content within `<claude>` thinking tags) is not stored.

This update will introduce a new logging mechanism. The tool will generate a second log file for each pipeline step, which will exclusively contain the AI's chain of thought. The original log file will continue to store only the final, clean output. This separation will make both the results and the process much easier to analyze.

---

### **Summary Checklist**

-   [x] **Update `src/tools/proc.ts`**: Modify the `runStreaming` function to support a new `thoughtsLogPath` and pass a `--thinking-log` flag to the `claude` CLI.
-   [x] **Modify `src/tools/orchestrator.ts`**: Update the `executeStep` and `runTask` functions to generate the path for the new thoughts log and pass it to the process runner.
-   [x] **Enhance Error Messages**: Update error handling to reference both the output log and the new thoughts log to make debugging easier.
-   [ ] **Update Documentation**: Add a new section to `README.md` explaining the new logging feature and the purpose of the `.thoughts.log` files.

---

### **Detailed Implementation Steps**

#### 1. Update Process Execution Logic (`src/tools/proc.ts`)

*   **Objective:** Modify the core function that runs the `claude` command to handle the new logging requirement.
*   **Task:**
    1.  Open the file `src/tools/proc.ts`.
    2.  Update the `runStreaming` function signature to accept a new optional parameter: `thoughtsLogPath?: string`.
    3.  Inside the function, create a new arguments array. If `thoughtsLogPath` is provided, add the `--thinking-log` flag and its value to this array.
    4.  Add a `console.log` message to inform the user where the thoughts are being logged, e.g., `[Proc] Logging thoughts to: ${thoughtsLogPath}`.

*   **Code Snippet (New `runStreaming` signature and logic):**
    ```typescript
    export function runStreaming(
      cmd: string,
      args: string[],
      logPath: string,
      cwd: string,
      stdinData?: string,
      thoughtsLogPath?: string // New parameter
    ): Promise<{ code: number; output: string }> {
      // Conditionally add the new flag
      const finalArgs = thoughtsLogPath ? [...args, "--thinking-log", thoughtsLogPath] : args;
    
      console.log(`[Proc] Spawning: ${cmd} ${finalArgs.join(" ")}`);
      console.log(`[Proc] Logging to: ${logPath}`);
      if (thoughtsLogPath) {
        console.log(`[Proc] Logging thoughts to: ${thoughtsLogPath}`);
      }
    
      // ... rest of the function uses finalArgs instead of args
    }
    ```

#### 2. Update the Orchestrator (`src/tools/orchestrator.ts`)

*   **Objective:** Make the main orchestrator aware of the new thoughts log and ensure it's created for every pipeline step.
*   **Task:**
    1.  Open `src/tools/orchestrator.ts`.
    2.  In the `executeStep` function, add a new parameter to its signature: `thoughtsLogFile: string`.
    3.  Pass this new `thoughtsLogFile` parameter down to the `runStreaming` function call.
    4.  In the `runTask` function, inside the main `for` loop, define the path for the new log file. The name should be based on the standard log file but with the `.thoughts.log` extension.
    5.  Pass this new path when you call `executeStep`.

*   **Code Snippet (New log path creation in `runTask`):**
    ```typescript
    // Inside the for loop in runTask()
    const logFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.log`);
    const thoughtsLogFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.thoughts.log`);

    await executeStep(name, command, fullPrompt, statusFile, logFile, thoughtsLogFile, check);
    ```

#### 3. Enhance Error Handling

*   **Objective:** Make debugging easier by pointing the user to both relevant log files when a step fails.
*   **Task:**
    1.  In `src/tools/orchestrator.ts`, locate the error handling block inside the `executeStep` function (the `if (code !== 0)` block).
    2.  Modify the `Error` message to include the path to both the standard log and the new thoughts log.

*   **Code Snippet (Updated error message):**
    ```typescript
    if (code !== 0) {
      updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
      throw new Error(`Step "${name}" failed. Check the output log for details: ${logFile}\nAnd the chain of thought log: ${thoughtsLogFile}`);
    }
    ```

#### 4. Update Documentation

*   **Objective:** Inform users about the new logging feature and how to use it for debugging.
*   **Task:**
    1.  Edit the main `README.md` file.
    2.  Add a new section titled "### Debugging and Logs".
    3.  Explain that for each pipeline step, two log files are now created under the `.claude/logs/` directory.
    4.  Describe the purpose of each file:
        *   `XX-step-name.log`: Contains the final, clean output from the AI tool.
        *   `XX-step-name.thoughts.log`: Contains the AI's detailed reasoning process (its "chain of thought").
    5.  Mention that reviewing the `.thoughts.log` file is the best way to understand *why* an unexpected output occurred.