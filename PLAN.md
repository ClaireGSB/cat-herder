
# PLAN: Comprehensive Enhancement of AI Interactive Halting

## Title & Goal

**Title:** Implement and Test Enhanced AI Interactive Halting with Full Context Logging and Cross-Step Propagation

**Goal:** To fully implement and test the AI's interactive halting (ask human) feature by explicitly logging user answers in the reasoning log, ensuring the AI receives its complete previous reasoning history upon resuming a paused step, and, critically, propagating the full history of human-AI interactions to all subsequent steps in the pipeline, leading to better context, more effective task completion, and clearer debugging.

## Description

This project addresses three core aspects of the `@your-scope/cat-herder` tool's interactive halting feature, building upon and fixing previous gaps:

1.  **Logging User Answers in Reasoning Log:** When the AI pauses to ask a user a question, the user's response is recorded in the task's state file (`.state.json`). This plan ensures that the answer is *also* explicitly written into the AI's `reasoning.log` file, providing a complete, chronological transcript of the human-AI dialogue for debugging and audit.
2.  **Contextual Step Resumption:** When the AI resumes a step after any interruption (human intervention, API rate limit pause, or a check failure retry), the prompt it receives will now include its own step-by-step reasoning that occurred *before* the pause. This prevents redundant thinking and ensures the AI picks up precisely where it left off, armed with its prior decision-making context.
3.  **Cross-Step Context Propagation:** A significant improvement ensures that the *entire history of human-AI interactions* (all questions asked and answers provided throughout the task so far) is automatically included as a dedicated context section in the prompt for *every subsequent step* in the pipeline. This means if an "implement" step asked for a critical clarification, a later "review" or "docs" step will automatically be made aware of that decision, preventing the AI from making conflicting choices or re-asking for already provided information.

The result will be a much more robust, intelligent, and transparent interactive AI workflow, where human guidance is consistently understood and applied throughout the entire development pipeline.

## Summary Checklist

- [x] **Feature:** Ensure `fs` is imported in `step-runner.ts` for file operations.
- [x] **Feature:** Implement logging of user answers directly into the reasoning log (`step-runner.ts`).
- [x] **Feature:** Refactor `step-runner.ts` to manage feedback consistently with `feedbackForNextRun`.
- [x] **Feature:** Implement logic in `step-runner.ts` to extract and include previous AI reasoning in resumption prompts.
- [x] **Feature:** Update existing context providers (`taskDefinition`, `planContent`) in `providers.ts` to accept new arguments.
- [x] **Feature:** Create a new `interactionHistory` context provider in `providers.ts`.
- [x] **Feature:** Integrate `interactionHistory` context into all step prompts in `pipeline-runner.ts`.
- [x] **Test:** Create a new test file for interactive halting.
- [x] **Test:** Write `vitest` tests for `interactionHistory` creation and content.
- [x] **Test:** Write `vitest` tests for `interactionHistory` presence in subsequent step prompts.
- [X] **Documentation:** Update `README.md` to describe the enhanced interaction logging and cross-step context propagation.
- [x] **Documentation:** Update `ARCHITECTURE.MD` to describe the new interaction flow and context management.

## Detailed Implementation Steps

### 1. Ensure `fs` is imported in `step-runner.ts`

-   **Objective:** To make Node.js file system functions available for logging user answers.
-   **Task:** Add the `fs` import statement at the top of `src/tools/orchestration/step-runner.ts`.
-   **Code Snippet (src/tools/orchestration/step-runner.ts - top of file):**

    ```typescript
    // ... other imports
    import fs from "node:fs"; // NEW: For appending to log files
    ```

### 2. Implement logging of user answers directly into the reasoning log (`step-runner.ts`)

-   **Objective:** To explicitly record the user's response in the AI's `reasoningLogFile` after an interactive pause.
-   **Task:** Locate the `catch (error instanceof HumanInterventionRequiredError)` block within the `executeStep` function in `src/tools/orchestration/step-runner.ts`. After the `answer` is received from `waitForHumanInput`, add a line to append this answer to the `reasoningLogFile`.
-   **Code Snippet (src/tools/orchestration/step-runner.ts - within `catch (HumanInterventionRequiredError)` block):**

    ```typescript
    // ... (existing code in the catch block before answer logging)

    // PROBLEM 1 FIX: Log the user's answer to the reasoning log file
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, -5);
    fs.appendFileSync(reasoningLogFile, `[${timestamp}] [USER_INPUT] User answered: "${answer}"\n\n`);

    // ... (rest of the code in the catch block)
    ```

### 3. Refactor `step-runner.ts` to manage feedback consistently with `feedbackForNextRun`

-   **Objective:** To unify the mechanism for providing feedback (user answer, rate limit message, check failure details) to the AI when resuming a step.
-   **Task:** In `src/tools/orchestration/step-runner.ts`, within the `executeStep` function:
    -   Initialize `feedbackForNextRun` at the start of the function.
    -   Modify the human intervention block, rate limit block, and check failure blocks to *set* `feedbackForNextRun` with the appropriate message, rather than directly modifying a `currentPrompt` variable.
-   **Code Snippet (src/tools/orchestration/step-runner.ts - start of `executeStep`):**

    ```typescript
    // ... (existing code)

    let feedbackForNextRun: string | null = null; // NEW: Initialize feedback manager

    // ... (rest of executeStep)
    ```
-   **Code Snippet (src/tools/orchestration/step-runner.ts - within `catch (HumanInterventionRequiredError)` block for user answer):**

    ```typescript
    // ... (after logging answer and updating status)

    // Prepare feedback for the NEXT loop iteration with human answer
    feedbackForNextRun = `You previously asked: "${error.question}". The user responded: "${answer}". Continue your work based on this answer.`;
    ```
-   **Code Snippet (src/tools/orchestration/step-runner.ts - within `if (result.rateLimit)` block for rate limit):**

    ```typescript
    // ... (after await new Promise(resolve => setTimeout(resolve, waitMs));)

    // Set feedbackForNextRun for rate limit resumption
    feedbackForNextRun = `You are resuming an automated task that was interrupted by an API usage limit. Your progress up to the point of interruption has been saved. Your goal is to review your previous actions and continue the task from where you left off.`;
    attempt--; // Decrement attempt to retry this same step
    continue; // Continue to the next iteration of the for loop
    ```
-   **Code Snippet (src/tools/orchestration/step-runner.ts - within `if (result.code !== 0)` and post-execution check failure blocks):**

    ```typescript
    // ... (after determining checkDescription)

    // Set feedbackForNextRun for check failure retry
    feedbackForNextRun = `Your previous attempt to complete the '${name}' step failed its validation check.\n\nHere are the original instructions you were given for this step:
--- ORIGINAL INSTRUCTIONS ---\n${fullPrompt}\n--- END ORIGINAL INSTRUCTIONS ---\n\n${checkDescription} failed with the following error output:
--- ERROR OUTPUT ---\n${result.output || 'No output captured'}\n--- END ERROR OUTPUT ---\n\nPlease re-attempt the task. Your goal is to satisfy the **original instructions** while also fixing the error reported above. Analyze both the original goal and the specific failure. Do not modify the tests or checks.`;
    continue; // The for loop will continue to the next attempt with this feedback.
    ```
    (Apply similarly to the post-execution check failure block if it exists and handles retries.)

### 4. Implement logic in `step-runner.ts` to extract and include previous AI reasoning in resumption prompts

-   **Objective:** To feed the AI its own detailed thought process from the current step's `reasoningLogFile` when it resumes.
-   **Task:** Within the `while (needsResume)` loop in `src/tools/orchestration/step-runner.ts`, implement the logic to parse `reasoningLogFile`, filter out non-reasoning content, and prepend it to the prompt.
-   **Code Snippet (src/tools/orchestration/step-runner.ts - inside `while (needsResume)` loop, before `runStreaming`):**

    ```typescript
    // --- START PROMPT CONSTRUCTION FOR THIS runStreaming CALL ---
    let previousReasoningForPrompt = '';
    if (fs.existsSync(reasoningLogFile)) {
      const fullLogContent = fs.readFileSync(reasoningLogFile, 'utf-8');
      const logLines = fullLogContent.split('\n');
      let filteredLines: string[] = [];
      let inReasoningSection = false;

      // Iterate in reverse to find the latest actual reasoning section
      // Filters out headers, footers, and internal debug lines added by proc.ts
      for (let i = logLines.length - 1; i >= 0; i--) {
        const line = logLines[i];
        if (line.includes('--- Process finished at:') || line.includes('--- Token Usage ---') || line.includes('--- PROMPT DATA ---')) {
          continue; // These are footers or start of input prompt data, skip them
        }
        if (line.includes('=================================================')) {
          break; // Found a header separator. This marks the end of the previous reasoning block. Stop.
        }
        if (line.includes('[PROCESS-DEBUG] Stdin data written and closed')) {
            continue; // Internal debug line, skip
        }
        if (line.includes('--- This file contains Claude\'s step-by-step reasoning process ---')) {
            inReasoningSection = true; // Found the reasoning intro line, start collecting
            continue;
        }
        if (inReasoningSection && line.trim() !== '') {
            filteredLines.unshift(line); // Add to the beginning to maintain original order
        }
      }
      previousReasoningForPrompt = filteredLines.join('\n').trim();
    }

    let promptParts: string[] = [fullPrompt]; // Always start with the original instructions for the step.

    if (previousReasoningForPrompt) {
      promptParts.push(`--- PREVIOUS ACTIONS LOG ---\n${previousReasoningForPrompt}\n--- END PREVIOUS ACTIONS LOG ---`);
    }

    if (feedbackForNextRun) {
      promptParts.push(`--- FEEDBACK ---\n${feedbackForNextRun}\n--- END FEEDBACK ---`);
      feedbackForNextRun = null; // Consume the feedback for this run
    }

    // Add a general instruction for continuation/action
    promptParts.push(`Please analyze the provided information and continue executing the plan to complete the step.`);
    const promptToUse = promptParts.join("\n\n");
    // --- END PROMPT CONSTRUCTION ---

    // ... (runStreaming call with promptToUse)
    ```

### 5. Update existing context providers (`taskDefinition`, `planContent`) in `providers.ts`

-   **Objective:** To standardize the interface for all context providers to accept `config`, `projectRoot`, `taskStatus`, and `originalTaskContent`, aligning them for future extensibility.
-   **Task:** Modify the `contextProviders` object in `src/tools/providers.ts`. Update the function signatures for `taskDefinition` and `planContent`.
-   **Code Snippet (src/tools/providers.ts - updated signatures):**

    ```typescript
    // src/tools/providers.ts
    // ... imports

    export const contextProviders: Record<string, (config: CatHerderConfig, projectRoot: string, taskStatus: TaskStatus, originalTaskContent: string) => string> = {
      taskDefinition: (_config, _projectRoot, _taskStatus, originalTaskContent) => originalTaskContent,
      planContent: (_config, projectRoot, _taskStatus, _originalTaskContent) => { // Updated signature
        const planPath = path.join(projectRoot, "PLAN.md");
        try {
          return readFileSync(planPath, 'utf-8');
        } catch {
          return '';
        }
      },
      // ... (interactionHistory provider will be added next)
    };
    ```

### 6. Create a new `interactionHistory` context provider in `providers.ts`

-   **Objective:** To generate a formatted string of all past human-AI questions and answers, suitable for inclusion in the AI's prompt.
-   **Task:** Add a new entry to the `contextProviders` object in `src/tools/providers.ts`. This provider will access `taskStatus.interactionHistory` and format it.
-   **Code Snippet (src/tools/providers.ts - new provider):**

    ```typescript
    // src/tools/providers.ts
    // ... (existing providers)

      interactionHistory: (_config, _projectRoot, taskStatus, _originalTaskContent) => { // NEW provider
        if (!taskStatus.interactionHistory || taskStatus.interactionHistory.length === 0) {
          return '';
        }

        let historyString = "--- HUMAN INTERACTION HISTORY ---\n";
        taskStatus.interactionHistory.forEach((interaction, index) => {
          historyString += `\n**Interaction #${index + 1} (${new Date(interaction.timestamp).toLocaleString()})**\n`;
          historyString += `**Q:** ${interaction.question}\n`;
          historyString += `**A:** ${interaction.answer}\n`;
        });
        historyString += "--- END HUMAN INTERACTION HISTORY ---";
        return historyString;
      }
    };
    ```

### 7. Integrate `interactionHistory` context into all step prompts in `pipeline-runner.ts`

-   **Objective:** To ensure that every single step in a task's pipeline receives the full history of human-AI interactions as part of its prompt context.
-   **Task:** In `src/tools/orchestration/pipeline-runner.ts`, within the `for...of selectedPipeline.entries()` loop:
    -   Read the *latest* `TaskStatus` at the beginning of each loop iteration to ensure the `interactionHistory` is up-to-date.
    -   Invoke the `interactionHistory` context provider and conditionally add its output to the `context` object passed to `assemblePrompt`.
-   **Code Snippet (src/tools/orchestration/pipeline-runner.ts - inside the step loop):**

    ```typescript
    // src/tools/orchestration/pipeline-runner.ts
    // ... (existing imports, ensure TaskStatus is imported from status.js)

      for (const [index, stepConfig] of selectedPipeline.entries()) {
        const { name, command, check } = stepConfig;
        // Read the current status at the beginning of each step iteration
        const currentTaskStatus: TaskStatus = readStatus(statusFile); // IMPORTANT: Get latest status here
        if (currentTaskStatus.steps[name] === 'done') {
          console.log(pc.gray(`[Orchestrator] Skipping '${name}' (already done).`));
          continue;
        }

        // Automatically assemble context based on step position in pipeline
        const context: Record<string, string> = {};

        // Always include task definition (updated provider call)
        context.taskDefinition = contextProviders.taskDefinition(config, projectRoot, currentTaskStatus, taskContent);

        // Include plan content for any step after "plan" (updated provider call)
        const planStepIndex = selectedPipeline.findIndex(step => step.name === 'plan');
        if (planStepIndex !== -1 && index > planStepIndex) {
          try {
            context.planContent = contextProviders.planContent(config, projectRoot, currentTaskStatus, taskContent);
          } catch (error) {
            console.log(pc.yellow(`[Orchestrator] Warning: Could not load plan content for step '${name}'. PLAN.md may not exist yet.`));
          }
        }

        // NEW: Include human interaction history for all steps
        const interactionHistory = contextProviders.interactionHistory(config, projectRoot, currentTaskStatus, taskContent);
        if (interactionHistory) { // Only add if there's actual history
          context.interactionHistory = interactionHistory;
        }

        // Read the specific command instructions for the current step
        const commandFilePath = path.resolve(projectRoot, '.claude', 'commands', `${command}.md`);
        const commandInstructions = readFileSync(commandFilePath, 'utf-8');

        // Assemble the full prompt using the assemblePrompt function (`context` now includes `interactionHistory`)
        const fullPrompt = assemblePrompt(selectedPipeline, name, context, commandInstructions, resolvedInteractionThreshold);

        // ... (rest of the step execution)
      }
    ```

## Error Handling & Warnings

-   **User Interruption During Input (Ctrl+C):** If a user presses `Ctrl+C` while the CLI is waiting for their answer to an AI question, the `waitForHumanInput` function will catch this, throw an `InterruptedError`, and the task will remain in the `waiting_for_input` state. The CLI will log a message indicating that input was interrupted and the task is paused. This allows the user to later provide the answer via the web dashboard or resume the task.
-   **Malformed Reasoning Log File:** The logic to extract `previousReasoningForPrompt` from `reasoningLogFile` includes robust filtering. In cases of a severely malformed, empty, or non-existent `reasoningLogFile`, `previousReasoningForPrompt` will simply be an empty string. This gracefully handles edge cases by providing a simpler prompt to the AI without prior reasoning, rather than crashing the process.
-   **Consistency of Prompts:** The refactoring ensures a consistent structure for all resumption prompts (human answer, rate limit, check failure), which reduces the chance of the AI misinterpreting its context.
-   **No Impact on Non-Interactive Flows:** These changes specifically target scenarios where the AI needs to resume or receive feedback. Fully autonomous runs (where `interactionThreshold` is 0 and no checks fail) will proceed as before, benefiting from cleaner code but without altering their core execution path.
-   **Missing `PLAN.md`:** The `planContent` provider now gracefully returns an empty string if `PLAN.md` doesn't exist, preventing crashes if a pipeline step expects a plan but it hasn't been created yet.

## Test Plan

We will use `vitest` for these tests. Create a new test file, for example, `test/interactive-halting.test.ts`.

### **Mocking Strategy**

To test the prompt content and interaction history effectively without spinning up actual Claude CLI processes, we will mock the following:

-   `src/tools/proc.ts`: Specifically, mock `runStreaming` to capture the prompt it receives and simulate `HumanInterventionRequiredError` or successful completion.
-   `src/tools/status.ts`: Mock `readStatus`, `updateStatus`, `readAndDeleteAnswerFile` to control the task state and inject answers.
-   `fs.readFileSync`, `fs.writeFileSync`, `fs.appendFileSync`, `fs.existsSync`: To control file system interactions, especially for reading/writing status files and reasoning logs.

### **Test Cases**

#### 1. `interactionHistory` Creation and Persistence

-   **Objective:** Verify that `TaskStatus.interactionHistory` correctly records questions and answers.
-   **Tests:**
    -   **Scenario:** Run a simple task that triggers `cat-herder ask`, provide an answer, then ensure the `task.state.json` contains the interaction.
    -   **Assertions:**
        -   `readStatus` should return a `TaskStatus` object with `interactionHistory` as an array.
        -   The `interactionHistory` array should contain an object with `question`, `answer`, and `timestamp` matching the interaction.

#### 2. User Answer Logging in `reasoning.log`

-   **Objective:** Verify that the user's answer is appended to the `reasoning.log` file.
-   **Tests:**
    -   **Scenario:** Simulate a task step asking a question and receiving an answer. Inspect the mock `reasoningLogFile` content.
    -   **Assertions:**
        -   The mocked `fs.appendFileSync` for the `reasoningLogFile` should have been called with a string containing `[USER_INPUT] User answered: "..."`.

#### 3. AI Resumption with Full Reasoning History

-   **Objective:** Verify that `runStreaming` receives a prompt containing the `PREVIOUS ACTIONS LOG` when resuming a step after an interactive pause or retry.
-   **Tests:**
    -   **Scenario 1 (Human Intervention):**
        -   Mock `runStreaming` to initially throw a `HumanInterventionRequiredError`.
        -   Mock `waitForHumanInput` to return a specific answer.
        -   Mock `runStreaming` *again* for the resumption, and capture the prompt it receives.
        -   **Assertions:** The captured prompt should contain a `--- PREVIOUS ACTIONS LOG ---` section with content similar to the simulated AI's initial reasoning, followed by `--- FEEDBACK ---` containing the user's answer.
    -   **Scenario 2 (Check Failure Retry):**
        -   Mock `runStreaming` to complete successfully, but mock `runCheck` to return `success: false` with specific error output.
        -   Mock `runStreaming` *again* for the retry, and capture its prompt.
        -   **Assertions:** The captured prompt should contain a `--- PREVIOUS ACTIONS LOG ---` section and a `--- FEEDBACK ---` section detailing the check failure.

#### 4. `interactionHistory` Presence in Subsequent Step Prompts

-   **Objective:** Verify that the `HUMAN INTERACTION HISTORY` is consistently passed as context to *all* subsequent steps in the pipeline.
-   **Tests:**
    -   **Scenario:** Define a pipeline with at least two steps (e.g., `implement` then `review`).
        -   Simulate the `implement` step asking a question and receiving an answer.
        -   Mock `runStreaming` for the `review` step, and capture the prompt it receives.
    -   **Assertions:**
        -   The prompt received by `runStreaming` for the `review` step should contain a `--- HUMAN INTERACTION HISTORY ---` section that includes the question and answer from the `implement` step.
        -   The `taskDefinition` and `planContent` contexts should also be present in the prompt (confirming updated provider calls).

### **Example Test Structure (`test/interactive-halting.test.ts`)**

```typescript
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

// Mock core modules
vi.mock('node:fs', async () => {
  const actualFs = await vi.importActual('node:fs');
  return {
    ...actualFs,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    existsSync: vi.fn(() => true), // Assume files exist by default for mocks
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});
vi.mock('../src/tools/proc.js', () => ({
  runStreaming: vi.fn(),
  killActiveProcess: vi.fn(),
}));
vi.mock('../src/tools/status.js', async () => {
  const actualStatus = await vi.importActual('../src/tools/status.js');
  return {
    ...actualStatus,
    readStatus: vi.fn(),
    updateStatus: vi.fn((file, mutator) => {
      const currentStatus = JSON.parse(fs.readFileSync(file, 'utf-8'));
      mutator(currentStatus);
      fs.writeFileSync(file, JSON.stringify(currentStatus, null, 2));
    }),
    readAndDeleteAnswerFile: vi.fn(),
  };
});
vi.mock('../src/tools/check-runner.js', () => ({
  runCheck: vi.fn(),
}));

// Import modules to test
import { executeStep } from '../src/tools/orchestration/step-runner.js';
import { executePipelineForTask } from '../src/tools/orchestration/pipeline-runner.js';
import { TaskStatus } from '../src/tools/status.js';
import { getConfig } from '../src/config.js'; // Ensure getConfig can be mocked if needed

// Helper for default config and status
const mockConfig = {
  taskFolder: 'cat-herder-tasks',
  statePath: './.cat-herder/state',
  logsPath: './.cat-herder/logs',
  manageGitBranch: false,
  autoCommit: false,
  waitForRateLimitReset: false,
  interactionThreshold: 5, // High interaction for testing
  pipelines: {
    default: [
      { name: 'plan', command: 'plan-task', check: { type: 'fileExists', path: 'PLAN.md' } },
      { name: 'implement', command: 'implement-task', check: { type: 'none' } }, // simplified checks for test
      { name: 'review', command: 'review-task', check: { type: 'none' } },
    ],
  },
  defaultPipeline: 'default',
};

const mockProjectRoot = '/mock/project';
const mockTaskPath = path.join(mockProjectRoot, 'cat-herder-tasks/test-task.md');
const mockTaskId = 'test-task-123';
const mockStatusFile = path.join(mockProjectRoot, '.cat-herder/state/test-task-123.state.json');
const mockReasoningLogFile = path.join(mockProjectRoot, '.cat-herder/logs/test-task-123/01-implement.reasoning.log');

beforeEach(() => {
  vi.clearAllMocks();
  // Mock getConfig
  vi.mocked(getConfig).mockResolvedValue(mockConfig as any);

  // Default mock behavior for fs functions
  vi.mocked(fs.readFileSync).mockImplementation((file: fs.PathOrFileDescriptor) => {
    if (file === mockStatusFile) {
      return JSON.stringify({
        version: 2, taskId: mockTaskId, taskPath: 'test-task.md', startTime: new Date().toISOString(), branch: 'main',
        currentStep: '', phase: 'pending', steps: {}, tokenUsage: {}, stats: null, lastUpdate: '', interactionHistory: [],
      } as TaskStatus);
    }
    if (String(file).endsWith('.md')) { // For task content and command instructions
      return '--- pipeline: default\ninteractionThreshold: 5 ---\n# Task Content';
    }
    return ''; // Default for other files
  });
  vi.mocked(fs.writeFileSync).mockImplementation(vi.fn());
  vi.mocked(fs.appendFileSync).mockImplementation(vi.fn());
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
  vi.mocked(fs.unlinkSync).mockReturnValue(undefined);
});

describe('Interactive Halting Features', () => {

  // Test Case 1: interactionHistory Creation and Persistence
  it('should record human interaction in TaskStatus and reasoning log', async () => {
    const mockQuestion = 'What is the right filename?';
    const mockAnswer = '_TEST.md';

    // Mock runStreaming to ask a question, then mock waitForHumanInput to answer it
    vi.mocked(runStreaming).mockRejectedValueOnce(new HumanInterventionRequiredError(mockQuestion));
    vi.spyOn(require('node:readline'), 'createInterface').mockReturnValue({
      question: vi.fn((q, cb) => cb(mockAnswer)),
      on: vi.fn(),
      close: vi.fn(),
    });
    vi.mocked(readAndDeleteAnswerFile).mockResolvedValueOnce(null); // Simulate CLI input

    // Keep track of status file content
    let currentTaskStatus: TaskStatus = {
      version: 2, taskId: mockTaskId, taskPath: 'test-task.md', startTime: new Date().toISOString(), branch: 'main',
      currentStep: '', phase: 'pending', steps: {}, tokenUsage: {}, stats: null, lastUpdate: '', interactionHistory: [],
    };
    vi.mocked(fs.readFileSync).mockImplementation((file: fs.PathOrFileDescriptor) => {
      if (file === mockStatusFile) return JSON.stringify(currentTaskStatus);
      if (String(file).endsWith('.md')) return '--- pipeline: default\ninteractionThreshold: 5 ---\n# Task Content';
      return '';
    });
    vi.mocked(fs.writeFileSync).mockImplementation((file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView) => {
      if (file === mockStatusFile) currentTaskStatus = JSON.parse(data.toString());
      // For reasoning log:
      if (String(file).endsWith('.reasoning.log')) {
        vi.mocked(fs.appendFileSync)(file, data); // Delegate to append to track calls
      }
    });


    // Run the step
    await executeStep(
      mockConfig.pipelines.default[1], // 'implement' step
      'Original prompt for implement',
      mockStatusFile,
      'mock.log',
      mockReasoningLogFile,
      'mock.raw.json.log',
      'default'
    ).catch(() => {}); // Catch the HumanInterventionRequiredError that's rethrown

    // Assert interaction history is in status
    expect(currentTaskStatus.interactionHistory).toHaveLength(1);
    expect(currentTaskStatus.interactionHistory[0].question).toBe(mockQuestion);
    expect(currentTaskStatus.interactionHistory[0].answer).toBe(mockAnswer);

    // Assert user answer is in reasoning log
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      mockReasoningLogFile,
      expect.stringContaining(`[USER_INPUT] User answered: "${mockAnswer}"`)
    );
  });

  // Test Case 2: AI Resumption with Full Reasoning History
  it('should include previous reasoning and feedback in resumption prompt', async () => {
    const mockQuestion = 'What should I do next?';
    const mockAnswer = 'Proceed with file creation.';
    const initialReasoning = '[TIMESTAMP] [ASSISTANT] [TEXT] I need to decide on the file name.\n[TIMESTAMP] [ASSISTANT] [TOOL_USE] Bash({"command":"cat-herder ask "What should I do next?"...})';
    const originalPrompt = 'Original prompt for implement step.';

    // Mock initial run to ask question
    vi.mocked(runStreaming)
      .mockImplementationOnce(async (cmd, args, log, rLog, cwd, promptData, rawLog, model, opts, taskId) => {
        // Simulate writing some reasoning before asking
        fs.appendFileSync(rLog, `\n=================================================\nNew Attempt Started...\n${initialReasoning}\n`);
        throw new HumanInterventionRequiredError(mockQuestion);
      });

    vi.spyOn(require('node:readline'), 'createInterface').mockReturnValue({
      question: vi.fn((q, cb) => cb(mockAnswer)),
      on: vi.fn(),
      close: vi.fn(),
    });
    vi.mocked(readAndDeleteAnswerFile).mockResolvedValueOnce(null);

    // Mock the second runStreaming call for resumption
    let resumptionPromptReceived: string | undefined;
    vi.mocked(runStreaming).mockImplementationOnce(async (cmd, args, log, rLog, cwd, promptData, rawLog, model, opts, taskId) => {
      resumptionPromptReceived = promptData;
      return { code: 0, output: 'Done', modelUsed: 'default' };
    });

    // Need to mock fs.readFileSync for the reasoningLogFile content
    vi.mocked(fs.readFileSync).mockImplementation((file: fs.PathOrFileDescriptor) => {
        if (file === mockReasoningLogFile) {
            return `
=================================================
  New Attempt Started at: 2025-08-28T00:00:00.000Z
  Command: claude /project:implement-task ...
  Pipeline: default
  Model: default
  Settings: ...
=================================================
--- This file contains Claude's step-by-step reasoning process ---
${initialReasoning}
[2025-08-28 00:00:01] [USER_INPUT] User answered: "${mockAnswer}"
`;
        }
        if (file === mockStatusFile) {
          return JSON.stringify({ /* status after first interaction */ interactionHistory: [{ question: mockQuestion, answer: mockAnswer, timestamp: new Date().toISOString() }] });
        }
        if (String(file).endsWith('.md')) { return '--- pipeline: default\ninteractionThreshold: 5 ---\n# Task Content'; }
        return '';
    });

    // Run the step (it will be interrupted and then resume)
    await executeStep(
      mockConfig.pipelines.default[1], // 'implement' step
      originalPrompt,
      mockStatusFile,
      'mock.log',
      mockReasoningLogFile,
      'mock.raw.json.log',
      'default'
    );

    // Assert the resumption prompt contains previous reasoning and feedback
    expect(resumptionPromptReceived).toBeDefined();
    expect(resumptionPromptReceived).toContain(originalPrompt);
    expect(resumptionPromptReceived).toContain('--- PREVIOUS ACTIONS LOG ---');
    expect(resumptionPromptReceived).toContain(initialReasoning.split('\n')[0]); // Check for a part of the initial reasoning
    expect(resumptionPromptReceived).toContain('--- FEEDBACK ---');
    expect(resumptionPromptReceived).toContain(`The user responded: "${mockAnswer}"`);
  });

  // Test Case 3: interactionHistory Presence in Subsequent Step Prompts
  it('should include human interaction history in subsequent step prompts', async () => {
    const mockQuestion = 'Which file name should I use for the output?';
    const mockAnswer = 'Use output_final.txt.';
    const taskContent = 'Analyze data and generate a report.';
    const mockPlanContent = 'Initial plan content.';

    // Mock initial status for the 'plan' step to be 'done'
    let currentTaskStatus: TaskStatus = {
      version: 2, taskId: mockTaskId, taskPath: 'test-task.md', startTime: new Date().toISOString(), branch: 'main',
      currentStep: 'plan', phase: 'pending', steps: { 'plan': 'done' }, tokenUsage: {}, stats: null, lastUpdate: '', interactionHistory: [],
    };

    // Mock readFileSync to return plan content and task content
    vi.mocked(fs.readFileSync).mockImplementation((file: fs.PathOrFileDescriptor) => {
        if (file === mockStatusFile) return JSON.stringify(currentTaskStatus);
        if (String(file).endsWith('test-task.md')) return `--- pipeline: default\ninteractionThreshold: 5 ---\n${taskContent}`;
        if (String(file).endsWith('PLAN.md')) return mockPlanContent;
        if (String(file).endsWith('implement-task.md')) return '# Implement instructions';
        if (String(file).endsWith('review-task.md')) return '# Review instructions';
        return '';
    });
    vi.mocked(fs.writeFileSync).mockImplementation((file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView) => {
        if (file === mockStatusFile) currentTaskStatus = JSON.parse(data.toString());
    });

    // Step 1: Simulate 'implement' step asking a question and getting an answer
    vi.mocked(runStreaming)
      .mockRejectedValueOnce(new HumanInterventionRequiredError(mockQuestion)); // Implement asks

    vi.spyOn(require('node:readline'), 'createInterface').mockReturnValue({
      question: vi.fn((q, cb) => cb(mockAnswer)),
      on: vi.fn(),
      close: vi.fn(),
    });
    vi.mocked(readAndDeleteAnswerFile).mockResolvedValueOnce(null);

    // Mock the second runStreaming for 'implement' to succeed after answer
    vi.mocked(runStreaming).mockResolvedValueOnce({ code: 0, output: 'Done', modelUsed: 'default' });

    // Mock runStreaming for the 'review' step to capture its prompt
    let reviewStepPromptReceived: string | undefined;
    vi.mocked(runStreaming).mockImplementationOnce(async (cmd, args, log, rLog, cwd, promptData, rawLog, model, opts, taskId) => {
      reviewStepPromptReceived = promptData;
      return { code: 0, output: 'Review done', modelUsed: 'default' };
    });

    // Run the pipeline
    await executePipelineForTask(mockTaskPath);

    // Assert that the review step's prompt contains the interaction history
    expect(reviewStepPromptReceived).toBeDefined();
    expect(reviewStepPromptReceived).toContain('--- HUMAN INTERACTION HISTORY ---');
    expect(reviewStepPromptReceived).toContain(`Q: ${mockQuestion}`);
    expect(reviewStepPromptReceived).toContain(`A: ${mockAnswer}`);
    expect(reviewStepPromptReceived).toContain('--- TASK DEFINITION ---'); // Check other contexts are present
    expect(reviewStepPromptReceived).toContain('--- PLAN CONTENT ---'); // Assuming plan was created by first step (or mocked)
  });
});

```

## Documentation Changes

### 1. Update `README.md`

-   **Objective:** To inform users about the improved `reasoning.log` content and the new capability for AI to remember human input across pipeline steps.
-   **Changes:**
    -   In the "Interactive Halting (Interaction Threshold)" section, update point 4 ("Resume") to explicitly mention that the *complete history of questions and answers* is automatically provided as context to *all subsequent steps*.
    -   In the "How It Works" -> "Automatic Context Assembly" section, add "Interaction History" as a new automatically assembled context element, explaining its purpose.
    -   In the "Debugging and Logs" section, update the description for `XX-step-name.reasoning.log` to explicitly state that it now includes the AI's detailed thinking process *and* any user answers provided during interactive halting.

### 2. Update `ARCHITECTURE.MD`

-   **Objective:** To update the architectural documentation to reflect the full scope of the human interaction feature, especially the cross-step context propagation and the detailed logging.
-   **Changes:**
    -   In section "2. Core Architectural Concepts" -> "2. Orchestration Layer", update the point about "prepares the necessary context and prompts" to explicitly mention the inclusion of the "historical record of human-AI interactions from previous steps in the task".
    -   In section "2. Core Architectural Concepts" -> "4. State Layer", emphasize that `interactionHistory` is crucial for providing context to *all subsequent steps*.
    -   Update the "Data Flow Diagram" (Section 2.B) to visually represent the `Interaction History` flowing from `State` back into the `Orchestration Layer` for subsequent steps' prompts. You can add an arrow or annotation to `State[State Files (.json)]` that says "(incl. Interaction History)" and ensure the arrow from `State` to `Orchestrator` implies this context.
    -   In section "AI Interaction Layer (`src/tools/proc.ts`)", briefly mention that the `reasoning.log` now contains the full interaction, including user answers.

