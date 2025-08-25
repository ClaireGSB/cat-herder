

### **PLAN: Validator-Enforced `askHuman` Permission**

#### **Goal**

To make the Interactive Halting feature robust by enhancing the `cat-herder validate` command to detect and report when a task requires the `askHuman` tool but is missing the necessary permission in its command file.

#### **Description**

Our previous attempt to automatically inject the `askHuman` permission failed because the underlying CLI does not support it. This refactor corrects that approach. We will revert the non-functional changes and instead improve our static validation. The `validate` command will now cross-reference the `interactionThreshold` with the `allowed-tools` list. If a discrepancy is found, it will produce a clear error, guiding the user to fix their configuration and preventing runtime failures.

#### **Summary Checklist**

-   [x] **1. Revert Previous Changes:** Remove the incorrect `--allow-tool` logic from the orchestrator and process spawner.
-   [x] **2. Enhance the Validator:** Add new logic to `validator.ts` to check for the `askHuman` permission when `interactionThreshold > 0`.
-   [ ] **3. Update Documentation:** Update the `README.md` to clarify the user's responsibility and highlight the validator's role.

---

### **Detailed Refactoring Steps**

#### 1. Revert Previous Changes

*   **Objective:** Remove the code that attempts to pass the `--allow-tool` flag, as it is non-functional.
*   **Tasks:**
    1.  **File `src/tools/proc.ts`:**
        *   Remove the `additionalTools?: string[]` parameter from the `runStreaming` function signature.
        *   Delete the block of code that loops through `additionalTools` and pushes `--allow-tool` to the `finalArgs` array.
    2.  **File `src/tools/orchestration/step-runner.ts`:**
        *   Remove the `additionalTools` parameter from the `executeStep` function signature.
        *   Remove the `additionalTools` argument from the `runStreaming` function call inside `executeStep`.
    3.  **File `src/tools/orchestration/pipeline-runner.ts`:**
        *   Delete the `additionalTools` array and the logic that populates it.
        *   Remove the `additionalTools` argument from the `executeStep` function call.

#### 2. Enhance the Validator

*   **Objective:** Make the `validate` command aware of the link between `interactionThreshold` and the `askHuman` tool.
*   **File:** `src/tools/validator.ts`
*   **Tasks:**
    1.  **Access Config in `validateStep`:** The `validateStep` function doesn't currently have access to the top-level `config` object. You will need to pass the `config` object down into it.
    2.  **Add New Validation Logic:** Inside `validateStep`, right after validating the basic structure, add a new check.
        *   Get the `interactionThreshold` for the current task (from `config.interactionThreshold`).
        *   Read the command file (`.claude/commands/....md`).
        *   Parse its frontmatter to get the `allowed-tools` list (you already have a helper for this).
        *   **If `interactionThreshold > 0` AND the `allowed-tools` list does NOT include `'askHuman'`, add a new, specific error to the `errors` array.**

*   **Code Snippet (`src/tools/validator.ts`):**

    ```typescript
    // First, update the function signature to accept the config
    function validateStep(
      step: any, 
      index: number, 
      pipelineName: string,
      config: CatHerderConfig, // Add this
      // ... other params
    ) {
      // ... existing validation logic ...

      // --- NEW VALIDATION LOGIC ---
      const threshold = config.interactionThreshold ?? 0;
      if (threshold > 0) {
        const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
        if (fs.existsSync(commandFilePath)) {
          const commandContent = fs.readFileSync(commandFilePath, 'utf-8');
          const frontmatter = parseFrontmatter(commandContent);
          const toolsValue = frontmatter?.['allowed-tools'] || '';
          const requiredTools: string[] = Array.isArray(toolsValue) ? toolsValue : toolsValue.split(',').map(t => t.trim());

          if (!requiredTools.includes('askHuman')) {
            errors.push(
              `${stepId}: The project is configured with a non-zero interactionThreshold, but this step's command file ('${step.command}.md') is missing the 'askHuman' permission in its 'allowed-tools' list.`
            );
          }
        }
      }
      // --- END NEW LOGIC ---

      // ... rest of the function ...
    }

    // Then update the call site in validatePipeline
    export function validatePipeline(config: CatHerderConfig, projectRoot: string): ValidationResult {
        // ...
        for (const [index, step] of pipeline.entries()) {
            validateStep(step, index, pipelineName, config, /*... other args*/); // Pass config in
        }
        // ...
    }
    ```

#### 3. Update Documentation

*   **Objective:** Clearly explain the requirement to the user in the `README.md`.
*   **File:** `README.md`
*   **Task:** Add a "Note" or "Important" block in the "Interactive Halting" section.
*   **Content Example:**
    > **Important:** When you set `interactionThreshold` to a value greater than 0, you **must** also grant the `askHuman` permission to the tools used in your pipeline. Add `'askHuman'` to the `allowed-tools` list in the frontmatter of your command `.md` files.
    >
    > The `cat-herder validate` command will detect if you forget this and provide a helpful error message.

This revised plan corrects the technical mistake and results in a much safer, more robust feature that aligns with the project's philosophy. It empowers the user by preventing errors before they happen.