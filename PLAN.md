

# PLAN.md

### **Title: Fix Chain of Thought (CoT) Logging via JSON Streaming**

**Goal:** To correctly capture Claude's "thinking" output by switching from raw text parsing to the official JSON streaming format provided by the `claude` CLI.

---

### **Description**

The previous implementation for CoT logging resulted in empty `.thoughts.log` files. The root cause was twofold:

1.  **Incorrect CLI Invocation:** Piping the prompt to the `claude` command via `stdin` causes it to return only the final, clean output, stripping away the `<claude>` thinking tags.
2.  **Conflicting Hook (Now Removed):** A `PostToolUse` hook in `settings.json` was consuming and discarding all of Claude's output before it could be processed.

This plan corrects the issue by using the documented `claude` CLI flags (`-p` and `--output-format stream-json`) to get a structured data stream. This is a more robust and reliable method than parsing XML tags from raw text.

---

### **Summary Checklist**

-   [x] **Refactor `src/tools/proc.ts`**: Rewrite the `runStreaming` function to use the `--output-format stream-json` flag and parse the resulting JSON objects.
-   [x] **Update `src/tools/orchestrator.ts`**: Modify `executeStep` to call the new `runStreaming` function with the prompt as a command-line argument instead of `stdin`.
-   [x] **Remove Conflicting Hook**: Ensure the `PostToolUse` hook in `src/dot-claude/settings.json` has been removed to prevent it from interfering with the output stream.
-   [ ] **Update Documentation**: Revise the `README.md` to accurately describe the logging mechanism and the content of each log file.

---

### **Detailed Implementation Steps**

#### 1. Refactor `runStreaming` to Handle JSON Output (`src/tools/proc.ts`)

*   **Objective:** To switch from parsing raw text to reliably parsing a stream of JSON objects from the `claude` CLI, routing content to the appropriate log files.
*   **Task:**
    1.  Modify the signature of the `runStreaming` function. It should now require a `thoughtsLogPath` and take the prompt content as a `prompt: string` argument instead of the optional `stdinData`.
    2.  Change the arguments passed to the `spawn` command to include `-p` and `--output-format stream-json`.
    3.  Implement a streaming JSON parser inside `p.stdout.on("data", ...)`:
        *   Use a buffer to handle JSON objects that may be split across multiple data chunks.
        *   Process each complete line, parse it as a JSON object, and use a `switch` statement on the `type` property.
        *   If `type` is `"thinking"`, write the `content` to the `thoughtsStream`.
        *   If `type` is `"tool_code"` or `"final_answer"`, write the `content` to the main `logStream` and to the console (`process.stdout`).

*   **Code Snippet (New `runStreaming` logic):**
    ```typescript
    // In src/tools/proc.ts

    export function runStreaming(
      cmd: string,
      args: string[],
      logPath: string,
      thoughtsLogPath: string, // Now required
      cwd: string,
      prompt: string // Prompt is now a direct argument
    ): Promise<{ code: number; output: string }> {
      
      const finalArgs = [...args, "-p", prompt, "--output-format", "stream-json"];
      
      // ... create logStream and thoughtsStream ...

      p.stdout.on("data", (chunk) => {
        // ... buffer and line splitting logic ...

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            switch (json.type) {
              case "thinking":
                thoughtsStream.write(json.content + "\n");
                break;
              case "tool_code":
              case "final_answer":
                process.stdout.write(json.content);
                logStream.write(json.content);
                finalOutput += json.content;
                break;
            }
          } catch (e) { /* handle parse error */ }
        }
      });
      // ...
    }
    ```

#### 2. Update `orchestrator.ts` to Pass Prompt as an Argument

*   **Objective:** To adapt the `executeStep` function to use the new, more reliable `runStreaming` function signature.
*   **Task:**
    1.  Open `src/tools/orchestrator.ts`.
    2.  Update the `executeStep` function signature to require `thoughtsLogFile: string`.
    3.  Modify the call to `runStreaming`. Pass `fullPrompt` as the final argument instead of the `stdinData` parameter.

*   **Code Snippet (Updated call in `executeStep`):**
    ```typescript
    // In src/tools/orchestrator.ts

    // Previous call:
    // const { code } = await runStreaming("claude", [`/project:${command}`], logFile, projectRoot, fullPrompt);

    // New call:
    const { code } = await runStreaming(
      "claude",
      [`/project:${command}`],
      logFile,
      thoughtsLogFile, // Pass the new path
      projectRoot,
      fullPrompt // Pass the prompt as an argument
    );
    ```

#### 3. Remove Conflicting `PostToolUse` Hook

*   **Objective:** To permanently remove the hook that was incorrectly consuming and discarding Claude's output stream.
*   **Task:**
    1.  Open `src/dot-claude/settings.json`.
    2.  Locate the `"PostToolUse"` key within the `"hooks"` object.
    3.  Delete the entire `"PostToolUse"` array and key.

*   **Code Snippet (What to remove from `settings.json`):**
    ```diff
    -    "PostToolUse": [
    -      {
    -        "matcher": "Edit|Write|MultiEdit",
    -        "hooks": [
    -          {
    -            "type": "command",
    -            "command": "node -e \"process.stdin.on('data',()=>{});\" >/dev/null 2>&1 || true"
    -          }
    -        ]
    -      }
    -    ]
    ```

#### 4. Update Documentation (`README.md`)

*   **Objective:** To ensure the project's documentation accurately reflects the logging system for future users and developers.
*   **Task:**
    1.  Open `README.md`.
    2.  Add a new section called `### Debugging and Logs`.
    3.  Clearly explain the purpose of the two log files generated for each step:
        *   `XX-step-name.log`: This contains the final, clean output from the AI (e.g., the code it wrote).
        *   `XX-step-name.thoughts.log`: This contains the detailed, step-by-step reasoning (Chain of Thought) from the AI.
    4.  Advise users to check the `.thoughts.log` file when they need to understand *why* the AI produced a particular result.