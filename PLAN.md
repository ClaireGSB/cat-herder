

# PLAN.md

## **Title: Implement Model-Specific Token Usage Tracking**

**Goal:** To track and report token usage for each pipeline step, aggregated by the specific Claude model used, and display these metrics in log files and state files.

---

## **Description**

Currently, the `claude-project` tool does not provide any visibility into how many tokens are consumed during a task. This makes it impossible to monitor costs or analyze the performance of different models within a pipeline.

This change will introduce a new feature to capture token usage data directly from the `claude` CLI's JSON stream. This data will be added to the footer of log files for individual steps and aggregated in the `task.state.json` and `sequence.state.json` files, with a clear breakdown by model. This will give users a precise understanding of their token consumption and associated costs.

---

## **Summary Checklist**

-   [ ] **1. Update State Interfaces:** Modify the `TaskStatus` and `SequenceStatus` interfaces to include structures for storing token usage data.
-   [ ] **2. Capture Token Usage from Stream:** Enhance the `runStreaming` function in `proc.ts` to parse and return token usage information from the `claude` CLI output.
-   [ ] **3. Aggregate and Persist Token Data in Orchestrator:** Update the `orchestrator.ts` to receive token usage from `runStreaming`, aggregate it per-model, and save it to the correct state files.
-   [ ] **4. Add Token Usage to Log File Footer:** Modify the `runStreaming` function in `proc.ts` to append a token usage summary to the footer of each log file.
-   [ ] **5. Write or Update Tests:** Create or modify tests to validate that token usage is correctly parsed, aggregated, and stored.
-   [ ] **6. Update Documentation:** Update `README.md` to explain the new token usage tracking feature and show examples of the new state file structures.

---

## **Detailed Implementation Steps**

### **1. Update State Interfaces**

*   **Objective:** Define the data structures for storing token usage information within our state files.
*   **File to Modify:** `src/tools/status.ts`
*   **Task:**
    1.  Create a new `TokenUsage` type to represent the token counts.
    2.  Create a `ModelTokenUsage` type, which will be a dictionary mapping model names to `TokenUsage` objects.
    3.  Add the `tokenUsage` property of type `ModelTokenUsage` to the `TaskStatus` interface.
    4.  In the `SequenceStatus` interface, add a `totalTokenUsage` property of type `ModelTokenUsage` to the `stats` object.
*   **Code Snippet (`src/tools/status.ts`):**
    ```typescript
    // Add these new types
    export type TokenUsage = {
      inputTokens: number;
      outputTokens: number;
      cacheCreationInputTokens: number;
      cacheReadInputTokens: number;
    };

    export type ModelTokenUsage = {
      [modelName: string]: TokenUsage;
    };

    // Update TaskStatus interface
    export type TaskStatus = {
      // ... existing properties
      tokenUsage: ModelTokenUsage;
      lastUpdate: string;
      // ... existing properties
    };

    // Update SequenceStatus interface
    export interface SequenceStatus {
      // ... existing properties
      stats: {
        totalDuration: number;
        totalDurationExcludingPauses: number;
        totalPauseTime: number;
        totalTokenUsage: ModelTokenUsage; // Add this line
      } | null;
    }

    // Update the default status objects to include the new properties
    const defaultStatus: TaskStatus = {
        // ...
        tokenUsage: {},
        // ...
    };

    const defaultSequenceStatus: SequenceStatus = {
        // ...
        stats: null // Existing, but ensure its update logic can handle totalTokenUsage
    };
    ```

### **2. Capture Token Usage from Stream**

*   **Objective:** Extract token usage data from the raw JSON stream produced by the `claude` CLI.
*   **File to Modify:** `src/tools/proc.ts`
*   **Task:**
    1.  Define a new `TokenUsage` interface within `proc.ts` that matches the structure of the `usage` object in the JSON stream.
    2.  Update the `StreamResult` interface to include an optional `tokenUsage` property.
    3.  In the `runStreaming` function, create a variable to aggregate token counts for the current step.
    4.  Inside the `p.stdout.on("data", ...)` handler, when parsing a JSON line, check if `json.message?.usage` exists.
    5.  If it exists, parse it and add its values to the step's aggregate token count.
    6.  When the process closes, return the aggregated `tokenUsage` in the `resolve` call.
*   **Code Snippet (`src/tools/proc.ts`):**
    ```typescript
    // Near top of file
    interface StepTokenUsage {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    }

    export interface StreamResult {
      code: number;
      output: string;
      tokenUsage?: StepTokenUsage; // Add this
      rateLimit?: {
        resetTimestamp: number;
      };
    }

    // Inside runStreaming function
    export function runStreaming(/*...args...*/): Promise<StreamResult> {
      // ...
      let stepTokenUsage: StepTokenUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
      let rateLimitInfo: StreamResult['rateLimit'] | undefined;
      // ...

      return new Promise((resolve) => {
        // ...
        p.stdout.on("data", (chunk) => {
          // ...
          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              // --- THIS IS THE NEW LOGIC ---
              if (json.message?.usage) {
                const usage = json.message.usage;
                stepTokenUsage.input_tokens += usage.input_tokens || 0;
                stepTokenUsage.output_tokens += usage.output_tokens || 0;
                stepTokenUsage.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
                stepTokenUsage.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
              }
              // --- END OF NEW LOGIC ---

              // ... (existing JSON processing)
            } catch (e) { /* ... */ }
          }
        });
        // ...
        p.on("close", (code) => {
           // ... (existing close logic)
           resolve({ code: code ?? 1, output: fullOutput, rateLimit: rateLimitInfo, tokenUsage: stepTokenUsage }); // Update resolve
        });
      });
    }
    ```

### **3. Aggregate and Persist Token Data in Orchestrator**

*   **Objective:** Integrate the captured token data into the task and sequence state management logic.
*   **File to Modify:** `src/tools/orchestrator.ts`
*   **Task:**
    1.  In `executeStep`, when the `runStreaming` promise resolves, retrieve the `tokenUsage` from the result.
    2.  If `tokenUsage` exists, call `updateStatus` to add these token counts to the `task.state.json` file under the correct model key. The model name is available in `stepConfig.model` or the default from the config.
    3.  In `runTaskSequence`, after a task successfully completes, read its state file to get its `tokenUsage`.
    4.  Aggregate these values into the `sequence.state.json` file's `stats.totalTokenUsage` object, again organized by model.
*   **Code Snippet (`src/tools/orchestrator.ts`):**

    ```typescript
    // Inside executeStep function, after runStreaming call
    const result = await runStreaming(/* ... */);
    // ...
    // After the tool run succeeds, before the check
    if (result.tokenUsage) {
      const modelName = stepConfig.model || 'default'; // Or get from config
      updateStatus(statusFile, s => {
        if (!s.tokenUsage) s.tokenUsage = {};
        if (!s.tokenUsage[modelName]) {
          s.tokenUsage[modelName] = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
        }
        s.tokenUsage[modelName].inputTokens += result.tokenUsage.input_tokens;
        s.tokenUsage[modelName].outputTokens += result.tokenUsage.output_tokens;
        s.tokenUsage[modelName].cacheCreationInputTokens += result.tokenUsage.cache_creation_input_tokens;
        s.tokenUsage[modelName].cacheReadInputTokens += result.tokenUsage.cache_read_input_tokens;
      });
    }
    
    // ... then run the check
    const checkResult = await runCheck(check, projectRoot);

    // Inside runTaskSequence, inside the `while (nextTaskPath)` loop, after a task completes
    await executePipelineForTask(nextTaskPath, { /* ... */ });

    // --- NEW LOGIC FOR SEQUENCE AGGREGATION ---
    const completedTaskStatusFile = path.resolve(projectRoot, config.statePath, `${path.basename(nextTaskPath, '.md').replace(/[^a-z0-9-]/gi, '-')}.state.json`);
    const completedTaskStatus = readStatus(completedTaskStatusFile);

    updateSequenceStatus(statusFile, s => {
        s.completedTasks.push(nextTaskPath!);
        s.currentTaskPath = null;
        s.phase = "pending";

        if (completedTaskStatus.tokenUsage) {
            if (!s.stats) { /* initialize stats object if null */ }
            if (!s.stats.totalTokenUsage) s.stats.totalTokenUsage = {};

            for (const [model, usage] of Object.entries(completedTaskStatus.tokenUsage)) {
                if (!s.stats.totalTokenUsage[model]) {
                    s.stats.totalTokenUsage[model] = { totalInputTokens: 0, totalOutputTokens: 0, /* ... */ };
                }
                s.stats.totalTokenUsage[model].totalInputTokens += usage.inputTokens;
                s.stats.totalTokenUsage[model].totalOutputTokens += usage.outputTokens;
                // ... and so on for other token types
            }
        }
    });
    ```

### **4. Add Token Usage to Log File Footer**

*   **Objective:** Provide immediate feedback on token usage for a step in its log file.
*   **File to Modify:** `src/tools/proc.ts`
*   **Task:**
    1.  In the `p.on("close", ...)` handler inside `runStreaming`, use the aggregated `stepTokenUsage` object.
    2.  Format this data into a human-readable string.
    3.  Append this string to the log footer that is written to both the main log and the reasoning log.
*   **Code Snippet (`src/tools/proc.ts`):**
    ```typescript
    // Inside runStreaming, in p.on("close", ...)
    p.on("close", (code) => {
      const endTime = new Date();
      // ...
      const tokenFooter = `\n--- Token Usage ---\n` +
                          `Input Tokens: ${stepTokenUsage.input_tokens}\n` +
                          `Output Tokens: ${stepTokenUsage.output_tokens}\n` +
                          `Cache Creation Input Tokens: ${stepTokenUsage.cache_creation_input_tokens}\n` +
                          `Cache Read Input Tokens: ${stepTokenUsage.cache_read_input_tokens}\n` +
                          `Service Tier: standard`; // Hardcoded for now unless available in stream

      const footer = `\n\n-------------------------------------------------\n` +
                     `--- Process finished at: ${endTime.toISOString()} ---\n` +
                     `--- Duration: ${duration.toFixed(2)}s, Exit Code: ${code} ---` +
                     `${tokenFooter}`; // Append token info

      logStream.write(footer);
      logStream.end();
      // ... also write to reasoningStream
      resolve({ /* ... */ });
    });
    ```

### **5. Write or Update Tests**

*   **Objective:** Ensure the new functionality is reliable and prevent future regressions.
*   **Files to Modify:** `test/orchestrator-*.test.ts`, and potentially a new `test/proc.test.ts`.
*   **Task:**
    1.  **Unit Test for `proc.ts`:** Create a test that simulates a JSON stream with `usage` objects and asserts that `runStreaming` correctly parses and aggregates the token counts.
    2.  **Integration Test for `orchestrator.ts`:**
        *   Create a test pipeline with steps using different models.
        *   Mock the `runStreaming` function to return pre-defined `tokenUsage` data for each step/model.
        *   Run a test task and assert that the final `task.state.json` contains the correctly aggregated token data, properly separated by model.
        *   Run a test sequence and assert the same for the `sequence.state.json`.

### **6. Update Documentation**

*   **Objective:** Inform users about the new token tracking feature.
*   **File to Modify:** `README.md`
*   **Task:**
    1.  Add a new section, perhaps under "Debugging and Logs" or in a new "Cost and Usage Monitoring" section.
    2.  Explain that token usage is now tracked.
    3.  Show an example of the new `Token Usage` footer in the log files.
    4.  Show examples of the updated `tokenUsage` object in `task.state.json` and `sequence.state.json`, explaining the per-model structure.

---

## **Error Handling & Warnings**

*   **Missing Token Data:** If the `usage` object is not present in the JSON stream from `claude` (e.g., due to an error or a different version of the CLI), the system should fail gracefully. No token data will be recorded for that step, but the process should not crash. The `tokenUsage` property will simply not be present in the `StreamResult`.
*   **Partial Token Data:** The aggregation logic should handle cases where a `usage` object might be missing some fields by treating missing values as `0`.
*   **CLI Logging:** No new CLI warnings are needed unless parsing of the state files or logs consistently fails, in which case existing error handling should suffice.