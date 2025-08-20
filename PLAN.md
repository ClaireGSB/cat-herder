

# PLAN: Implement Interactive Halting ("Fucks Given" Threshold)

## Implementation Plan

### Goal

To introduce a configurable "Interaction Threshold" that allows the AI agent to pause its workflow and ask the user for clarification, turning the autonomous process into a collaborative dialogue.

### Description

Currently, `cat-herder` runs from start to finish without human input. This change addresses the need for human oversight in complex or ambiguous tasks. The new behavior will allow the AI to use a special `askHuman` tool when its confidence is below a configured threshold. This will pause the task, prompt the user for an answer in the CLI, and then resume with the user's guidance. This feature makes the tool safer for high-stakes operations and more robust when dealing with unclear requirements.

Make sure you read the PRD attached at the end of this document for a complete overview of the feature.

### Summary Checklist

-   [x] **1. Configuration & State:** Add `interactionThreshold` to config files and update the task state structure to support pausing.
-   [x] **2. Prompt Engineering:** Modify the prompt assembly logic to make the AI aware of the threshold and the new `askHuman` tool.
-   [x] **3. Orchestration Logic:** Implement the core pause, prompt, and resume workflow in the step runner.
-   [x] **4. CLI & Web UI:** Display the paused state, the AI's question, and the interaction history.
-   [x] **5. Testing:** Add unit and integration tests for the new interactive workflow.
-   [ ] **6. Documentation:** Update `README.md` and `ARCHITECTURE.MD` to reflect the new feature.

---

### Detailed Implementation Steps

#### 1. Configuration & State

*   **Objective:** Update the project's configuration and state management files to recognize and store all the data related to the new feature.
*   **Tasks:**
    1.  **Update `CatHerderConfig` Interface:**
        *   **File:** `src/config.ts`
        *   **Action:** Add the optional `interactionThreshold: number` property.
        *   **Snippet:**
            ```typescript
            export interface CatHerderConfig {
              // ... existing properties
              interactionThreshold?: number;
              waitForRateLimitReset?: boolean;
              // ...
            }

            const defaultConfig: Omit<CatHerderConfig, ...> = {
              // ... existing properties
              interactionThreshold: 0, // Default to fully autonomous
              autoCommit: false,
              // ...
            };
            ```    2.  **Update Template Config File:**
        *   **File:** `src/templates/cat-herder.config.js`
        *   **Action:** Add the new property with detailed comments explaining the `0-5` scale.
    3.  **Update `TaskStatus` Type:**
        *   **File:** `src/tools/status.ts`
        *   **Action:** Add a new phase `waiting_for_input` and fields for storing the question and interaction history.
        *   **Snippet:**
            ```typescript
            export type Phase = "pending" | "running" | "done" | "failed" | "interrupted" | "waiting_for_reset" | "waiting_for_input";

            export type TaskStatus = {
              // ... existing properties
              pendingQuestion?: {
                question: string;
                timestamp: string;
              };
              interactionHistory: {
                question: string;
                answer: string;
                timestamp: string;
              }[];
              // ...
            };

            const defaultStatus: TaskStatus = {
              // ...
              phase: "pending",
              steps: {},
              interactionHistory: [], // Initialize as an empty array
              // ...
            };
            ```
    4.  **Update `types.ts`:**
        *   **File:** `src/types.ts`
        *   **Action:** Add `'waiting_for_input'` to the `ALL_STATUS_PHASES` array.

#### 2. Prompt Engineering

*   **Objective:** Teach the AI about the new threshold system and how to use the `askHuman` tool.
*   **Tasks:**
    1.  **Update `parseTaskFrontmatter`:**
        *   **File:** `src/tools/orchestration/prompt-builder.ts`
        *   **Action:** Modify the function to read `interactionThreshold` from the task's YAML frontmatter.
    2.  **Update `assemblePrompt`:**
        *   **File:** `src/tools/orchestration/prompt-builder.ts`
        *   **Action:** The function must now accept the `interactionThreshold` and inject new instructions into the prompt.
        *   **Snippet:**
            ```typescript
            // In assemblePrompt function
            const threshold = 3; // This value should be passed in.
            const interactionIntro = `You are operating at an interaction threshold of ${threshold}/5. A threshold of 0 means you must never ask for clarification. A threshold of 5 means you must use the \`askHuman(question: string)\` tool whenever you face a choice or ambiguity. Scale your use of this tool accordingly. When you use \`askHuman\`, your work will pause until a human provides an answer.`;

            // ... later in the function ...
            return [
              interactionIntro, // Add the new instructions
              intro,
              // ... rest of the prompt assembly
            ].join('\n\n');
            ```
    3.  **Thread `interactionThreshold` Down:**
        *   **Files:** `src/tools/orchestrator.ts`, `src/tools/orchestration/pipeline-runner.ts`, `src/tools/orchestration/step-runner.ts`
        *   **Action:** Pass the resolved `interactionThreshold` (from config or frontmatter) down through the function calls until it reaches `assemblePrompt`.

#### 3. Orchestration Logic

*   **Objective:** Implement the core pause-and-resume workflow when the AI calls `askHuman`.
*   **Tasks:**
    1.  **Define a Custom Error for Halting:**
        *   **File:** `src/tools/orchestration/errors.ts`
        *   **Action:** Create a new error class to signal an intentional pause.
        *   **Snippet:**
            ```typescript
            export class HumanInterventionRequiredError extends Error {
              public readonly question: string;
              constructor(question: string) {
                super("Human intervention is required.");
                this.name = "HumanInterventionRequiredError";
                this.question = question;
              }
            }
            ```
    2.  **Detect `askHuman` Tool Use:**
        *   **File:** `src/tools/proc.ts`
        *   **Action:** In the `runStreaming` function, while parsing the JSON stream, if you detect a `tool_use` event for `askHuman`, capture the question and throw the new `HumanInterventionRequiredError`. This will stop the `claude` process and signal the orchestrator.
    3.  **Implement the Pause-Prompt-Resume Loop:**
        *   **File:** `src/tools/orchestration/step-runner.ts`
        *   **Action:** Wrap the `runStreaming` call inside a `do...while` loop or a recursive function. This will handle the entire interactive flow.
        *   **Pseudo-code for the loop in `executeStep`:**
            ```typescript
            let needsResume = true;
            let feedbackForResume = null;

            while (needsResume) {
              try {
                // Modify assemblePrompt to include feedbackForResume if it exists
                const prompt = assemblePrompt(...);
                await runStreaming(prompt, ...);
                needsResume = false; // If it finishes without error, exit loop
              } catch (error) {
                if (error instanceof HumanInterventionRequiredError) {
                  // 1. PAUSE: Update status to 'waiting_for_input' with the question.
                  updateStatus(statusFile, s => {
                    s.phase = 'waiting_for_input';
                    s.pendingQuestion = { question: error.question, timestamp: new Date().toISOString() };
                  });

                  // 2. PROMPT: Use Node's `readline` to ask the user the question in the CLI.
                  const answer = await promptUser(error.question);

                  // 3. RESUME: Update status again, moving question to history.
                  updateStatus(statusFile, s => {
                    s.interactionHistory.push({ question: error.question, answer, ... });
                    s.pendingQuestion = undefined;
                    s.phase = 'running';
                  });

                  // 4. Prepare feedback for the next loop iteration.
                  feedbackForResume = `You previously asked: "${error.question}". The user responded: "${answer}". Continue your work.`;
                } else {
                  // It's a real error, re-throw it.
                  throw error;
                }
              }
            }
            ```

#### 4. CLI & Web UI

*   **Objective:** Make the new state visible and understandable to the user on all interfaces.
*   **Tasks:**
    1.  **Update Data Access Layer:**
        *   **File:** `src/tools/web/data-access.ts`
        *   **Action:** Update the `TaskDetails` interface to include `pendingQuestion` and `interactionHistory`.
    2.  **Update Live Activity Page:**
        *   **File:** `src/templates/web/live-activity.ejs`
        *   **Action:** Add EJS logic to check if `taskToShow.phase === 'waiting_for_input'`. If so, display a prominent card with the content of `taskToShow.pendingQuestion.question`.
    3.  **Update Task Detail Page:**
        *   **File:** `src/templates/web/task-detail.ejs`
        *   **Action:** Add a new section that iterates over `task.interactionHistory`. Display a list of Q&A pairs.
    4.  **Update WebSocket Handler:**
        *   **File:** `src/public/js/dashboard.js`
        *   **Action:** Ensure the `handleRealtimeUpdate` function correctly handles the `'waiting_for_input'` phase to update the UI badge and show/hide the question card.

#### 5. Testing

*   **Objective:** Verify that the new, complex workflow is reliable.
*   **Tasks:**
    1.  **Unit Test for Prompt Assembly:**
        *   **File:** `test/prompt-builder.test.ts` (create if needed)
        *   **Action:** Add a test to confirm that `assemblePrompt` correctly includes the interaction threshold instructions when a non-zero threshold is provided.
    2.  **Integration Test for Step Runner:**
        *   **File:** `test/orchestrator-interaction.test.ts` (create a new test file)
        *   **Action:** Write a test for `executeStep` that uses mocks (`vitest.mock`).
            *   Mock `proc.ts` so `runStreaming` throws a `HumanInterventionRequiredError`.
            *   Mock Node's `readline` to provide a canned answer.
            *   Assert that `updateStatus` is called with the correct state transitions (`running` -> `waiting_for_input` -> `running`).
            *   Assert that `runStreaming` is called a second time with a prompt that includes the user's answer.

#### 6. Documentation

*   **Objective:** Ensure the project's documentation is updated to reflect the new feature.
*   **Tasks:**
    1.  **Update `README.md`:**
        *   Add a new section explaining the `interactionThreshold` feature.
        *   Show examples of how to configure it in `cat-herder.config.js` and in task frontmatter.
        *   Explain the `0-5` scale.
    2.  **Update `ARCHITECTURE.MD`:**
        *   In the "State Layer" section, document the new `waiting_for_input` phase and the `interactionHistory` field.
        *   In the "Orchestration Layer" diagram and description, add a step showing how the `step-runner` can enter a "paused" state and prompt the user before resuming communication with the AI Interaction Layer.
        *   Mention the new `askHuman` tool as part of the AI's capabilities.

---

### Error Handling & Warnings

*   **Invalid Threshold Value:** If `interactionThreshold` is not a number between 0 and 5, the `cat-herder validate` command should produce an error.
*   **User Interruption (Ctrl+C) during Prompt:** If the user hits Ctrl+C while being prompted for an answer, the task should gracefully exit and its state should remain `waiting_for_input`. This allows the user to resume the task later and answer the same question.
*   **Log Clarity:** The logs must clearly indicate when a pause occurs, what the question was, and what the user's answer was before resuming the normal log stream.

---

## Appendix: Product Requirements Document (PRD)


### 1. Overview

The `cat-herder` tool currently operates as a fully autonomous agent. Once a task is started, it runs to completion or failure without human intervention. This is highly efficient for well-defined, predictable tasks.

However, for complex, ambiguous, or high-stakes tasks (e.g., major code refactoring, initial architecture design), the AI may encounter situations where it must make a critical assumption. An incorrect assumption can lead to a suboptimal result or a complete failure, wasting time and resources.

This document proposes a new **Interaction Threshold**—affectionately nicknamed the "fucks given" level. This feature will transform the AI from a simple executor into a collaborative partner by giving it a mechanism to pause the workflow and ask for human clarification when its confidence is low. This turns the AI's monologue into a dialogue, increasing the success rate of complex tasks and building user trust.

### 2. Goals & Objectives

*   **Primary Goal:** To introduce a configurable level of AI autonomy, allowing users to balance speed with safety.
*   **Objectives:**
    *   Create a system where the AI can pause its work to ask a clarifying question.
    *   Allow users to configure this "interruption sensitivity" globally and per-task.
    *   Provide a clear, simple CLI for users to receive questions and provide answers.
    *   Persist the history of these interactions for transparency and debugging.
    *   Visually represent the paused state and interaction history in the Web UI.

### 3. User Stories

1.  **As a Developer doing a risky refactor**, I want to set a high Interaction Threshold (e.g., 5) so the agent asks me "Should I rename this public-facing API?" before making a potentially breaking change.
2.  **As a Developer running a routine chore like updating documentation**, I want to set the threshold to 0, because I trust the AI to handle it and don't want to be interrupted.
3.  **As a Team Lead**, I want to set a default threshold of 2 in our project's `cat-herder.config.js` to encourage a baseline level of caution, while still allowing developers to override it for specific tasks.
4.  **As a Developer who just started a task**, I want to be able to walk away, and if the AI has a question, the CLI process will wait for me to return and provide an answer to unblock it.
5.  **As a Developer reviewing a completed task in the UI**, I want to see the questions the AI asked and the answers I provided to understand the context of the final output.

### 4. Feature Requirements

#### 4.1. Configuration: The `interactionThreshold`

*   A new configuration property will be introduced: `interactionThreshold`.
*   **Scale:** An integer from `0` to `5`.
    *   `0`: **Zero Fucks Given (Fully Autonomous)**. The AI must never ask a question. It must make its best assumption and proceed. This is the default to maintain existing behavior.
    *   `1-2`: **Low Interruption (High Confidence)**. The AI should only ask a question if it is fundamentally blocked or faces a highly critical, ambiguous choice (e.g., "The PRD is contradictory, which path should I take?").
    *   `3`: **Medium Interruption (Balanced)**. The AI should ask when it encounters ambiguity in requirements or has to make a significant, non-obvious implementation choice.
    *   `4-5`: **High Interruption (Low Confidence)**. The AI should be very cautious. It should ask to confirm assumptions, clarify minor ambiguities, and present options before proceeding with any significant work.
*   **Global Setting:**
    *   In `cat-herder.config.js`, a new top-level property can be set:
        ```javascript
        module.exports = {
          // ...
          interactionThreshold: 0, // Default is 0 for backward compatibility
        };
        ```
*   **Task-Level Override:**
    *   The threshold can be overridden in a task's YAML frontmatter. This takes precedence.
        ```markdown
        ---
        pipeline: default
        interactionThreshold: 4
        ---
        # This is a complex task. Be cautious and ask questions.
        ```

#### 4.2. AI & Tooling: The `askHuman` Tool

*   A new tool must be made available to the AI: `askHuman`.
*   **Tool Signature:** The tool will take a single string argument: `question`.
*   **Prompt Engineering:** The core system prompt will be modified to include instructions about the threshold and the new tool.
    > "You are operating at an interaction threshold of **[X]/5**. A threshold of 0 means you must never ask for clarification. A threshold of 5 means you must use the `askHuman(question: string)` tool whenever you face a choice or ambiguity. Scale your use of this tool accordingly. When you use `askHuman`, your work will pause until a human provides an answer."

#### 4.3. The Workflow: Pause, Prompt, and Resume

1.  **Pause:**
    *   When the AI uses the `askHuman` tool, the orchestrator detects this tool call.
    *   The orchestrator immediately pauses the execution of the current step.
    *   The task's state file is updated. The `phase` changes from `running` to a new state: `waiting_for_input`.
    *   A new object, `pendingQuestion`, is added to the state, containing the question text and a timestamp.

2.  **Prompt:**
    *   The CLI will display a clear message and the AI's question.
        ```bash
        [Orchestrator] Task has been paused. The AI needs your input.

        🤖 QUESTION:
        The user story mentions a "simplified user profile page," but the technical brief details both an "admin view" and a "public view."
        Should I implement both views, or just the public-facing one for now?

        Your answer: _
        ```
    *   The CLI process will wait indefinitely for the user to type an answer and press Enter.

3.  **Resume:**
    *   Once the user provides an answer, the orchestrator captures the text.
    *   The answer is fed back to the Claude CLI as the `tool_result` for the `askHuman` call.
    *   The `pendingQuestion` in the state file is cleared and moved to an `interactionHistory` array, along with the user's answer.
    *   The task `phase` is set back to `running`.
    *   The AI receives the answer and continues its work.

#### 4.4. State & Log Management

*   **Task State File (`<task-id>.state.json`):**
    *   A new `phase` will be added: `waiting_for_input`.
    *   A new top-level field `interactionHistory: []` will be added to store an array of `{question, answer, timestamp}` objects.
*   **Log Files:**
    *   The question from the AI and the answer from the human will be clearly logged in both the main (`.log`) and reasoning (`.reasoning.log`) files to provide a complete audit trail.

#### 4.5. Web Dashboard UI

*   **Live Activity Page:**
    *   When a task phase is `waiting_for_input`, the UI should clearly show this status with a distinct icon (e.g., a pause or question-mark icon).
    *   A new card/component should appear prominently displaying the AI's pending question.
    *   *(Non-Goal for V1: Answering via the UI. It will be read-only).*
*   **Task Detail Page:**
    *   A new section titled "Human Interactions" or "Q&A Log" will be added.
    *   This section will display the `interactionHistory`, showing each question asked by the AI and the corresponding answer provided by the human, creating a clear narrative of the decision-making process.

### 5. Non-Goals (For This Version)

*   **Answering questions from the Web UI.** Interaction is CLI-only in V1 to keep complexity low.
*   **Interaction Timeouts.** The workflow will wait indefinitely.
*   **Complex answer types.** The feature will only support simple text-in, text-out. No multiple-choice, file uploads, etc.
*   **Allowing the user to edit files or run commands while paused.** The workflow is strictly paused until an answer is given.

---