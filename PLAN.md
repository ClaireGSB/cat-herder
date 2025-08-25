### **PLAN: Automatic Injection of `askHuman` Tool Permission**

#### **Goal**

To make the Interactive Halting feature more robust and less error-prone by automatically injecting the `askHuman` tool permission whenever the `interactionThreshold` for a task is greater than zero.

#### **Description**

The current implementation requires developers to manually add `askHuman` to the `allowed-tools` list in their command prompt files. Forgetting this step silently disables the interactive halting feature, as the AI has no permission to ask questions. This refactor will make the system responsible for granting this permission, ensuring that if a developer requests interactivity, the system will always honor it.

#### **Summary Checklist**

-   [x] **1. Orchestration Logic:** Modify the `pipeline-runner` to detect the interaction threshold and prepare the necessary tool permission.
-   [x] **2. Process Spawning Logic:** Modify `proc.ts` to accept and apply additional tool permissions when spawning the `claude` CLI process.
-   [x] **3. Testing:** Update existing tests to assert that the new flag is passed to the CLI.
-   [x] **4. Documentation:** Briefly update the `README.md` to inform users that this permission is now handled automatically.

---

### **Detailed Refactoring Steps**

#### 1. Update Orchestration Logic to Prepare the Permission

*   **Objective:** In the orchestrator, identify when `askHuman` is needed and prepare to pass that information down to the process runner.
*   **File:** `src/tools/orchestration/pipeline-runner.ts`
*   **Task:**
    1.  In the `executePipelineForTask` function, you already have the `resolvedInteractionThreshold`.
    2.  After calculating this value, create a new variable, `additionalTools`, which is an array of strings.
    3.  If `resolvedInteractionThreshold > 0`, push `'askHuman'` into the `additionalTools` array.
    4.  Pass this `additionalTools` array as a new option to the `executeStep` function call.
*   **Code Snippet (`pipeline-runner.ts`):**
    ```typescript
    // ... inside executePipelineForTask ...
    const resolvedInteractionThreshold = taskInteractionThreshold ?? config.interactionThreshold ?? 0;
    const additionalTools: string[] = [];

    if (resolvedInteractionThreshold > 0) {
      additionalTools.push('askHuman');
    }

    // ... later, in the loop ...
    await executeStep(
      stepConfig, 
      fullPrompt, 
      statusFile, 
      // ... other args ...
      additionalTools // Pass the new array
    );
    ```

#### 2. Update Process Spawner to Apply the Permission

*   **Objective:** Modify the `runStreaming` function to accept the list of additional tools and add the correct command-line flags when spawning `claude`.
*   **Files:** `src/tools/orchestration/step-runner.ts`, `src/tools/proc.ts`
*   **Tasks:**
    1.  **Thread the parameter:** Update the function signature for `executeStep` in `step-runner.ts` to accept the `additionalTools: string[]` array and pass it along to its `runStreaming` call.
    2.  **Update `runStreaming`:**
        *   Modify the function signature in `proc.ts` to accept `additionalTools?: string[]` as an argument.
        *   Inside the function, before spawning the process, check if the `additionalTools` array is present and not empty.
        *   If it is, loop through it and add the appropriate flag to the `finalArgs` array. The `claude` CLI uses the `--allow-tool` flag for this.
*   **Code Snippet (`proc.ts`):**
    ```typescript
    // In runStreaming function signature
    export function runStreaming(
      // ... other args ...
      model?: string,
      options?: RunStreamingOptions,
      additionalTools?: string[] // Add this new parameter
    ): Promise<StreamResult> {
      // ...
      const finalArgs = [...args, "--output-format", "stream-json", "--verbose"];

      if (model) { /* ... */ }

      // --- THIS IS THE NEW LOGIC ---
      if (additionalTools && additionalTools.length > 0) {
        for (const tool of additionalTools) {
          finalArgs.push("--allow-tool", tool);
        }
      }
      // --- END OF NEW LOGIC ---

      console.log(`[Proc] Spawning: ${cmd} ${finalArgs.join(" ")}`);
      // ... rest of the function
    }
    ```

By implementing this refactor, you make the system more intelligent and remove a potential point of human error, making the entire interactive halting feature significantly more reliable.