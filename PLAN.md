

### **FINAL PLAN V4: The Definitive Guide to Implementing Interactive Halting**

#### **Goal**

To implement the full Interactive Halting feature, including a dedicated `cat-herder ask` command and a robust, maintainable prompt system that loads instructions from a dedicated markdown template file.

#### **Architecture Overview**

1.  **Prompt:** When `interactionThreshold > 0`, the orchestrator will load a new markdown template, inject the threshold value, and add it to the main prompt. This template instructs the AI to use the `bash cat-herder ask "..."` command to ask questions.
2.  **AI Action:** The AI will execute this `Bash` command when it needs to ask a question.
3.  **Signal:** The `cat-herder ask` command will update the task's `.state.json` file, setting its `phase` to `waiting_for_input` and storing the question. It will then exit immediately.
4.  **Detection:** The main orchestrator process, which is polling the state file, will detect the phase change and recognize it as a signal to pause.
5.  **Interaction:** The orchestrator will then present the question to the user via the CLI and poll for an answer from either the CLI or the web UI's new API endpoint.
6.  **Resumption:** Once an answer is received, it will be fed back into the next prompt for the AI, which will then resume its work.

---

### Implementation Chekklist
- [x] **Step 1 - The Validator:** Remove the old `askHuman` permission check and add a new check for `Bash(cat-herder ask:*)` in `settings.json`.
- [x] **Step 2 - The Prompt Builder:** Remove the hardcoded `askHuman` instruction and replace it with logic to load from a new markdown template file.
- [x] **Step 3 - Create the Prompt Template File:** Create `src/tools/prompts/interaction-intro.md` with distinct sections for each interaction level.
- [x] **Step 4 - Create the `cat-herder ask` Command:** Implement the CLI command that updates the task state to signal a pause.
- [x] **Step 5 - Update Prompt Engineering Logic to be Content-Aware:** Refactor the prompt builder to select and inject the correct section from the template based on the threshold value.
- [x] **Step 6 - Update the Orchestrator:** Implement the logic to set the environment variable and poll the state file for the pause signal.
- [x] **Step 7 - Update the Validator:** Ensure the validator checks for the correct permissions.



---

### **Detailed Implementation Steps**

#### **1. The Validator: The Core Change**

*   **What is Superfluous:** The logic in `src/tools/validator.ts` that checks if `askHuman` is in a command's `allowed-tools` list.
*   **Why:** We are abandoning the concept of a tool named `askHuman`. The new mechanism will be a `Bash` command, and its permission will be checked differently.
*   **Action:**
    *   **Go to:** `src/tools/validator.ts`
    *   **Find the function:** `validateStep`
    *   **Delete this entire block of code:**

    ```typescript
    // DELETE THIS BLOCK
    // Interactive Halting Validation
    const threshold = config.interactionThreshold ?? 0;
    if (threshold > 0) {
      const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
      if (fs.existsSync(commandFilePath)) {
        const commandContent = fs.readFileSync(commandFilePath, 'utf-8');
        const frontmatter = parseFrontmatter(commandContent);
        const toolsValue = frontmatter?.['allowed-tools'] || '';
        const requiredTools: string[] = Array.isArray(toolsValue) ? toolsValue : toolsValue.split(',').map((t: string) => t.trim());

        if (!requiredTools.includes('askHuman')) {
          errors.push(
            `${stepId}: The project is configured with a non-zero interactionThreshold, but this step's command file ('${step.command}.md') is missing the 'askHuman' permission in its 'allowed-tools' list.`
          );
        }
      }
    }
    ```
    *   Later, as part of the new implementation, you will add a *different* check to the main `validatePipeline` function to look for `Bash(cat-herder ask:*)` in `settings.json`.

#### 2. The Prompt Builder: The Outdated Instructions

*   **What is Superfluous:** The hardcoded string in `src/tools/orchestration/prompt-builder.ts` that tells the AI to use the `askHuman` tool.
*   **Why:** This instruction is incorrect and will be replaced by new logic that loads the detailed instructions from the `.md` template file we discussed.
*   **Action:**
    *   **Go to:** `src/tools/orchestration/prompt-builder.ts`
    *   **Find the function:** `assemblePrompt`
    *   **Delete this entire variable definition:**

    ```typescript
    // DELETE THIS VARIABLE AND ITS USAGE
    const interactionIntro = `You are operating at an interaction threshold of ${interactionThreshold}/5. A threshold of 0 means you must never ask for clarification. A threshold of 5 means you must use the \`askHuman(question: string)\` tool whenever you face a choice or ambiguity. Scale your use of this tool accordingly. When you use \`askHuman\`, your work will pause until a human provides an answer.`;
    ```
    *   Make sure to also remove `interactionIntro` from the array that is joined together at the end of the function.



#### 3. Create the Prompt Template File

*   **Objective:** Externalize the interaction prompt into a file that provides clear, behavioral definitions for each interaction threshold level.
*   **Action:** Create the new directory and file for our internal system prompts.
*   **New File Path:** `src/tools/prompts/interaction-intro.md`
*   **File Content:** This file will contain distinct sections for each level of caution. We will use simple placeholders that our code can easily find and replace.

    ```markdown
    <!-- INTERACTION_LEVEL_LOW -->
    Your "Interaction Threshold" is set to %%INTERACTION_THRESHOLD%%/5. This is a LOW interaction level.
    You should ONLY ask a question if you are completely blocked by a contradiction in your instructions or if you are about to perform a potentially destructive or irreversible action (e.g., deleting a file). For all other ambiguities, you must make a reasonable assumption and proceed.

    <!-- INTERACTION_LEVEL_MEDIUM -->
    Your "Interaction Threshold" is set to %%INTERACTION_THRESHOLD%%/5. This is a MEDIUM interaction level.
    You should ask a question when you face a significant architectural or technical decision that is not specified in your instructions (e.g., choosing a library, deciding on a new API structure). You should also ask if requirements are vague. Do not ask about minor implementation details.

    <!-- INTERACTION_LEVEL_HIGH -->
    Your "Interaction Threshold" is set to %%INTERACTION_THRESHOLD%%/5. This is a HIGH interaction level.
    You should be very cautious. Ask questions to clarify any ambiguity, no matter how small. Ask to confirm your understanding of a requirement before implementing it. When you have multiple valid options, present them to the user and ask which one to proceed with.

    <!-- COMMON_INSTRUCTIONS -->
    When you need to ask a clarifying question, you MUST use the Bash tool to run the following command. Your question MUST be enclosed in double quotes:
    bash cat-herder ask "Your clear and specific question goes here."

    **GOOD questions to ask:**
    - (Conflicting Instructions): "The instructions mention two different filenames, '_test.md' and '_testTASK.md'. Which one should I create?"
    - (Major Technical Choice): "The plan requires a new API endpoint. Should I add this to the existing 'v1/api.ts' router, or create a new 'v2/api.ts' file for it?"

    **BAD questions to ask:**
    - (Things you can figure out yourself): "Does the 'src/components' directory exist?" (Use the 'LS' tool instead.)
    - (Open-ended questions): "What should I do next?"
    ```

#### 4. Create the `cat-herder ask` Command

*   **Objective:** Implement the CLI command that the AI will call to signal a pause.
*   **Files:** `src/index.ts`, `src/cli-actions.ts`, `src/tools/status.ts`
*   **Actions:**
    1.  **`src/index.ts`:** Define the command.
        ```typescript
        program
          .command("ask <question>")
          .description("INTERNAL: Used by the AI to ask a clarifying question.")
          .action(askAction);
        ```
    2.  **`src/cli-actions.ts`:** Implement the `askAction`. It will use an environment variable, `CLAUDE_TASK_ID`, which the orchestrator will set, to identify the correct task.
        ```typescript
        export async function askAction(question: string): Promise<void> {
          const taskId = process.env.CLAUDE_TASK_ID;
          if (!taskId) { /* ... error handling ... */ process.exit(1); }
          
          // ... logic to get config and stateDir ...
          const statusFile = path.join(stateDir, `${taskId}.state.json`);

          updateStatus(statusFile, (s) => {
            s.phase = 'waiting_for_input';
            s.pendingQuestion = { question, timestamp: new Date().toISOString() };
          });
          
          process.exit(0); // Exit successfully
        }
        ```
    3.  *(No changes needed in `status.ts` for this step, as `updateStatus` is sufficient)*

#### 5. Update Prompt Engineering Logic to be Content-Aware

*   **Objective:** Modify the prompt builder to select and inject the correct behavioral instructions based on the threshold value.
*   **Files:** `src/tools/orchestration/prompt-builder.ts` and `src/config.ts`
*   **Actions:**
    1.  **`src/config.ts`:** Add the `getPromptTemplatePath` helper as planned.
    2.  **`src/tools/orchestration/prompt-builder.ts`:** Refactor `assemblePrompt` to be intelligent. It will now load the template, select the correct section based on the threshold, and then inject it.
        ```typescript
        import fs from 'node:fs';
        import path from 'node:path';
        import { getPromptTemplatePath } from '../../config.js';

        function getInteractionIntro(threshold: number): string {
          if (threshold === 0) return '';

          const templatePath = getPromptTemplatePath('interaction-intro.md');
          const templateContent = fs.readFileSync(templatePath, 'utf-8');
          
          let instructions;
          if (threshold <= 2) { // Low
            instructions = templateContent.match(/<!-- INTERACTION_LEVEL_LOW -->(.*?)<!--/s)[1];
          } else if (threshold <= 4) { // Medium
            instructions = templateContent.match(/<!-- INTERACTION_LEVEL_MEDIUM -->(.*?)<!--/s)[1];
          } else { // High
            instructions = templateContent.match(/<!-- INTERACTION_LEVEL_HIGH -->(.*?)<!--/s)[1];
          }
          
          const commonInstructions = templateContent.match(/<!-- COMMON_INSTRUCTIONS -->(.*)/s)[1];
          
          let intro = (instructions + commonInstructions).trim();
          intro = intro.replace(/%%INTERACTION_THRESHOLD%%/g, String(threshold));
          
          return intro;
        }

        export function assemblePrompt(/*...args...*/, interactionThreshold: number): string {
          const interactionIntro = getInteractionIntro(interactionThreshold);
          // ... assemble the rest of the prompt, conditionally adding interactionIntro
        }
        ```

#### 6. Update the Orchestrator

*   **Objective:** Implement the logic to set the environment variable and poll the state file for the pause signal.
*   **Files:** `src/tools/proc.ts`, `src/tools/orchestration/step-runner.ts`
*   **Actions:**
    1.  **`proc.ts`:** In `runStreaming`, pass the `taskId` into the child process's environment.
        ```typescript
        // You'll need to add taskId to the function signature
        export function runStreaming(..., taskId: string): Promise<StreamResult> {
          //...
          const p = spawn(cmd, finalArgs, {
            //...
            env: {
              ...process.env,
              CAT_HERDER_ACTIVE: "true",
              CLAUDE_TASK_ID: taskId, // Here is the critical line
            },
          });
          //...
        }
        ```
    2.  **`step-runner.ts`:** In `executeStep`, implement the `Promise.race` logic as described in the previous plan to poll the state file while the AI is running. When `status.phase === 'waiting_for_input'`, it should `killActiveProcess()` and throw the `HumanInterventionRequiredError` to trigger the user prompt.

#### 7. Update the Validator

*   **Objective:** Ensure the validator checks for the correct permissions.
*   **File:** `src/tools/validator.ts`
*   **Actions:**
    1.  Remove any old logic that checks for a tool named `askHuman`.
    2.  Add logic to the main `validatePipeline` function that checks if `interactionThreshold > 0`. If it is, ensure the `Bash(cat-herder ask:*)` permission is present in `.claude/settings.json` and add it to `missingPermissions` if it's not.
