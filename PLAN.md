# PLAN.md

### **Title: Implement Raw JSON Logging for LLM Steps**

**Goal:** Introduce a new log file for each pipeline step that captures the complete, unfiltered JSON output from the Large Language Model to provide deeper debugging capabilities.

---

### **Description**

Currently, debugging the interaction with the LLM is limited to the final, cleaned output (`.log`) and a high-level summary of the AI's thought process (`.reasoning.log`). This makes it difficult to inspect the raw, event-by-event stream from the LLM, which includes every tool-use attempt, content delta, and metadata.

This change will introduce a third log file, `XX-step-name.raw.json.log`, for each step. This file will contain the verbatim `stream-json` output, giving developers a powerful tool to diagnose complex issues by seeing the exact, low-level data exchange between the orchestrator and the LLM.

---

### **Summary Checklist**

-   [ ] **Configuration:** Update the orchestrator to generate a path for the new raw JSON log file.
-   [ ] **Implementation:** Modify the process runner to write the raw `stdout` stream from the LLM to the new log file.
-   [ ] **Documentation:** Update `README.md` to document the new `*.raw.json.log` file and its purpose.

---

### **Detailed Implementation Steps**

#### **1. Update the Orchestrator (`src/tools/orchestrator.ts`)**

*   **Objective:** Make the orchestrator responsible for defining the path to the new log file and passing it through the execution flow.
*   **Tasks:**
    1.  In the `runTask` function, inside the `for` loop, define a new constant `rawJsonLogFile` that follows the existing naming convention (e.g., `01-plan.raw.json.log`).
    2.  Update the `executeStep` function signature to accept the new `rawJsonLogFile: string` parameter.
    3.  In `executeStep`, pass this new path along to the `runStreaming` function call.

*   **Code Snippet (for `runTask`):**

    ```typescript
    // src/tools/orchestrator.ts in runTask()
    const logFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.log`);
    const reasoningLogFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.reasoning.log`);
    const rawJsonLogFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.raw.json.log`); // <-- ADD THIS LINE

    await executeStep(stepConfig, fullPrompt, statusFile, logFile, reasoningLogFile, rawJsonLogFile); // <-- ADD ARGUMENT
    ```

*   **Code Snippet (for `executeStep`):**
    ```typescript
    // src/tools/orchestrator.ts
    async function executeStep(
      stepConfig: PipelineStep,
      fullPrompt: string,
      statusFile: string,
      logFile: string,
      reasoningLogFile: string,
      rawJsonLogFile: string // <-- ADD PARAMETER
    ) {
      // ...
      const { code } = await runStreaming("claude", [`/project:${command}`], logFile, reasoningLogFile, projectRoot, currentPrompt, rawJsonLogFile); // <-- PASS ARGUMENT
      // ...
    }
    ```

---

#### **2. Modify the Process Runner (`src/tools/proc.ts`)**

*   **Objective:** Intercept the raw `stdout` data from the spawned `claude` process and write it to the new log file before any parsing occurs.
*   **Tasks:**
    1.  Update the `runStreaming` function signature to accept a new optional parameter, `rawJsonLogPath?: string`.
    2.  Inside the function, if `rawJsonLogPath` is provided, create a new `WriteStream` for it. Remember to create the directory if it doesn't exist.
    3.  In the `p.stdout.on("data", ...)` event handler, take each complete line from the buffer and write it directly to the `rawJsonStream`.
    4.  Ensure the `rawJsonStream` is properly closed in the `p.on("close", ...)` event handler.

*   **Code Snippet (for `runStreaming`):**

    ```typescript
    // src/tools/proc.ts

    import { /*...,*/ WriteStream } from "node:fs";

    export function runStreaming(
      cmd: string,
      args: string[],
      logPath: string,
      reasoningLogPath: string,
      cwd: string,
      stdinData?: string,
      rawJsonLogPath?: string // <-- ADD OPTIONAL PARAMETER
    ): Promise<{ code: number; output: string }> {
        
      // ... inside the function
      if (rawJsonLogPath) {
        console.log(`[Proc] Logging raw JSON to: ${rawJsonLogPath}`);
      }

      // ... after creating other streams
      let rawJsonStream: WriteStream | undefined;
      if (rawJsonLogPath) {
        mkdirSync(dirname(rawJsonLogPath), { recursive: true });
        rawJsonStream = createWriteStream(rawJsonLogPath, { flags: 'w' });
      }
      
      // ...
      p.stdout.on("data", (chunk) => {
        // ... inside the loop over lines
        for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (rawJsonStream) {
                rawJsonStream.write(line + '\n'); // <-- WRITE RAW LINE
            }
            
            try {
              // ... existing JSON parsing logic
            } catch (e) {
              // ... existing error handling
            }
        }
      });
      
      // ...
      p.on("close", (code) => {
        // ...
        if (rawJsonStream) {
          rawJsonStream.write(footer + footer2 + footer3);
          rawJsonStream.end(); // <-- CLOSE THE STREAM
        }
        
        resolve({ code: code ?? 1, output: fullOutput });
      });
    }
    ```

---

### **Error Handling & Warnings**

*   The implementation should be fault-tolerant. If `rawJsonLogPath` is not provided, the system must continue to function exactly as it did before.
*   The `proc.ts` module should add a console log message indicating that it is creating the raw JSON log file, which helps with visibility during execution. For example: `[Proc] Logging raw JSON to: .claude/logs/task-id/01-step.raw.json.log`.
*   Directory creation for the log file must use `mkdirSync(path, { recursive: true })` to prevent errors if the parent directories do not exist.

---

### **3. Update Documentation (`README.md`)**

*   **Objective:** Clearly explain the new logging feature to users.
*   **Tasks:**
    1.  Navigate to the `### Debugging and Logs` section in `README.md`.
    2.  Add the new `XX-step-name.raw.json.log` file to the list of generated logs.
    3.  Provide a clear explanation of what the raw JSON log contains and in what scenarios it is most useful (e.g., "deep debugging of the tool's behavior").
*   **Content Snippet (for `README.md`):**
    ```markdown
    ### Debugging and Logs

    The orchestrator provides comprehensive logging to help you understand both what happened and why. For each pipeline step, three log files are created in the `.claude/logs/` directory:

    -   **`XX-step-name.log`**: Contains the final, clean output from the AI tool. This is the polished result you would normally see.
    -   **`XX-step-name.reasoning.log`**: Contains the AI's detailed reasoning process. This shows the step-by-step thinking that led to the final output.
    -   **`XX-step-name.raw.json.log`**: Contains the raw, line-by-line JSON objects streamed from the LLM. This is useful for deep debugging of the tool's behavior, as it shows every event, including tool use attempts and content chunks.

    **When to use each log:**
    -   Use the standard `.log` file to see what the AI produced.
    -   Use the `.reasoning.log` file to understand *why* the AI made specific decisions.
    -   Use the `.raw.json.log` file for in-depth analysis of the raw communication with the AI.
    