# PLAN: Implement Flexible Single-Step ("Stepless") Pipelines

## ✅ **IMPLEMENTATION COMPLETE** 

All tasks have been successfully completed, including the final documentation updates.

## Title & Goal

**Title:** Implement Flexible Single-Step ('Stepless') Pipelines
**Goal:** To allow users to define simple, single-action workflows alongside complex multi-step ones using a single, unified configuration system.

## Description

Currently, the tool is designed around multi-step pipelines, which is powerful but can be overly complex for simple tasks (e.g., "update this documentation file"). This change introduces a more flexible model where any pipeline can be "stepless" by containing a single step with the special keyword `command: "self"`.

This will allow users to define multiple single-step workflows, each with its own specific guardrails (`fileAccess`), validation (`check`), and retry logic, directly within the existing `pipelines` object. The prompt sent to the AI for these simple tasks will be streamlined, removing the multi-step boilerplate for a clearer, more direct instruction.

## Summary Checklist

-   [x] **Update Configuration Model:** Modify `src/config.ts` to officially support `'self'` as a command type.
-   [x] **Modify Orchestration Logic:** Update `src/tools/orchestration/pipeline-runner.ts` to handle the `'self'` command by using the task's content as its instructions.
-   [x] **Simplify Prompt Generation:** Update `src/tools/orchestration/prompt-builder.ts` to generate a simplified, direct prompt for single-step pipelines.
-   [x] **Enhance Validation:** Update `src/tools/validator.ts` to enforce that a pipeline using `'self'` can only have one step.
-   [x] **Update Templates & Documentation:** Update `cat-herder.config.js` template, `README.md`, and `ARCHITECTURE.md` to reflect the new, unified feature. ✅ **COMPLETED** - All documentation tasks have been finished.

## Detailed Implementation Steps

### 1. Update Configuration Model and Types

-   **Objective:** Formally allow `command: "self"` in our internal type definitions.
-   **Task:** In `src/config.ts`, modify the `PipelineStep` interface.

-   **Code Snippet (`src/config.ts`):**
    ```typescript
    export interface PipelineStep {
      name: string;
      // Change 'string' to a union type to include 'self'
      command: string | 'self';
      model?: string;
      check: CheckConfig | CheckConfig[];
      fileAccess?: {
        allowWrite?: string[];
      };
      retry?: number;
    }

    ```

### 2. Modify the Pipeline Runner Logic

-   **Objective:** Teach the orchestrator how to handle a `'self'` command differently from a standard command.
-   **Task:** In `src/tools/orchestration/pipeline-runner.ts`, inside the `executePipelineForTask` function's main loop, add conditional logic to determine the source of instructions.

-   **Code Snippet (`src/tools/orchestration/pipeline-runner.ts`):**
    ```typescript
    // Inside the `for` loop of `executePipelineForTask`
    
    let commandInstructions: string;
    const context: Record<string, string> = {};

    // Interaction history is always relevant for retries
    const interactionHistory = contextProviders.interactionHistory(config, projectRoot, currentTaskStatus, taskContent);
    if (interactionHistory) {
      context.interactionHistory = interactionHistory;
    }

    // If the command is 'self', the instructions ARE the task content.
    if (stepConfig.command === 'self') {
        commandInstructions = taskContent;
    } else {
        // Otherwise, load from the command file and assemble the full context.
        context.taskDefinition = contextProviders.taskDefinition(config, projectRoot, currentTaskStatus, taskContent);
        // ... (add planContent if applicable)
        
        const commandFilePath = path.resolve(projectRoot, '.claude', 'commands', `${stepConfig.command}.md`);
        commandInstructions = readFileSync(commandFilePath, 'utf-8');
    }

    // The assemblePrompt function will now receive the correct instructions.
    const fullPrompt = assemblePrompt(
      selectedPipeline,
      stepConfig.name,
      context,
      commandInstructions,
      resolvedInteractionThreshold
    );
    
    // ... rest of the loop
    ```

### 3. Simplify Prompt Assembly

-   **Objective:** Generate a lean, direct prompt for single-step pipelines, removing the multi-step context.
-   **Task:** In `src/tools/orchestration/prompt-builder.ts`, modify `assemblePrompt` to detect this case and return a different prompt structure.

-   **Code Snippet (`src/tools/orchestration/prompt-builder.ts`):**
    ```typescript
    export function assemblePrompt(
      pipeline: PipelineStep[],
      currentStepName: string,
      context: Record<string, string>,
      commandInstructions: string,
      interactionThreshold: number = 0
    ): string {
      const isSimpleTask = pipeline.length === 1 && pipeline[0].command === 'self';
      const interactionIntro = getInteractionIntro(interactionThreshold);
      const intro = `You are an autonomous agent responsible for completing the following task.`;

      if (isSimpleTask) {
        // Simplified Prompt for "Stepless" Pipelines
        const historyContext = context.interactionHistory 
          ? `--- HUMAN INTERACTION HISTORY ---\n${context.interactionHistory}` 
          : "";

        return [
          intro,
          interactionIntro,
          historyContext,
          `--- YOUR TASK ---`,
          commandInstructions, // This is the task's body
        ].filter(Boolean).join("\n\n");

      } else {
        // Existing Multi-Step Prompt Logic (can be slightly refactored)
        const multiStepIntro = `Here is a task that has been broken down into several steps. You are an autonomous agent responsible for completing one step at a time.`;
        const pipelineStepsList = pipeline.map((step, index) => `${index + 1}. ${step.name}`).join('\n');
        const pipelineContext = `This is the full pipeline for your awareness:\n${pipelineStepsList}`;
        const responsibility = `You are responsible for executing step "${currentStepName}".`;

        // ... existing logic to build contextString ...

        return [
          multiStepIntro,
          interactionIntro,
          pipelineContext,
          // ... rest of the multi-step prompt assembly
        ].filter(Boolean).join("\n\n");
      }
    }
    ```

### 4. Update the Pipeline Validator

-   **Objective:** Add a rule to prevent invalid pipeline configurations and ensure the validator understands `'self'`.
-   **Task:** In `src/tools/validator.ts`, update the `validatePipeline` function.

-   **Code Snippet (`src/tools/validator.ts`):**
    ```typescript
    // Inside the main loop of `validatePipeline`
    for (const [pipelineName, pipeline] of Object.entries(pipelines)) {
        if (!Array.isArray(pipeline)) continue;

        // NEW RULE: A pipeline with a 'self' step must have exactly one step.
        const hasSelfStep = pipeline.some(step => step.command === 'self');
        if (hasSelfStep && pipeline.length > 1) {
          errors.push(`Pipeline '${pipelineName}': A pipeline using 'command: "self"' can only contain a single step.`);
          continue; // Skip further validation for this broken pipeline
        }

        for (const [index, step] of pipeline.entries()) {
            const stepId = `Pipeline '${pipelineName}', Step ${index + 1} ('${step.name || 'unnamed'}')`;
            
            // ... (existing step validation)

            // MODIFIED LOGIC: Don't check for a command file if command is 'self'
            if (step.command === 'self') {
              // This is valid, no external file to check permissions for.
            } else if (step.command) {
              const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
              validatePermissions(commandFilePath, stepId, allowedPermissions, errors, missingPermissions);
            } else {
              errors.push(`${stepId}: is missing the 'command' property.`);
            }
        }
    }
    ```

## Error Handling & Warnings

-   **User Misconfiguration:** If a user defines a pipeline with `command: "self"` and other steps, the `cat-herder validate` command must fail and output a clear error message:
    > `✖ Pipeline configuration is invalid:`
    > `- Pipeline 'my-pipeline': A pipeline using 'command: "self"' can only contain a single step.`
-   **Invalid Command:** If a user specifies a `command: "self"` pipeline but the task markdown file is empty, the process should proceed, sending an empty prompt to the AI, which will likely result in an error or no action. This is acceptable behavior as the user is responsible for the task content.

## Documentation Changes

-   **Objective:** Ensure all user-facing documentation clearly explains the new, unified pipeline model.
-   **Tasks:**
    1.  **Update `src/templates/cat-herder.config.js`:**
        -   Add comments explaining `command: "self"`.
        -   Include examples of both a multi-step pipeline (`default`) and at least two single-step pipelines (`just-do-it`, `docs-task`) to showcase different checks and guardrails.

    2.  **Update `README.md`:**
        - update the diagram in the "**Conceptual Flow:**" section to keep some pipelines with steps and some without.
        -   Rework the "Configurable Pipelines" section into "Flexible Pipelines: Multi-Step and Single-Step Workflows".
        -   Clearly explain that `command: "self"` is the key to creating single-step tasks.
        -   Provide an example of a task file using `pipeline: docs-task` in its frontmatter.

    3.  **Update `ARCHITECTURE.md`:**
        -   In section `2.A.2 Orchestration Layer`, update the description to reflect that the orchestrator simply executes the steps of the selected pipeline, regardless of count.
        -   Remove any diagrams or text that imply separate "modes".
        -   Update the Mermaid diagram to show a simple, linear flow from Orchestrator to a "Loop Pipeline Steps" block, as it no longer needs a decision diamond. The new diagram should look like this:
            ```mermaid
            graph TD
                User[User] --> CLI[CLI: cat-herder run]
                CLI --> Orchestrator[Orchestrator]
                Orchestrator -- Reads --> Config[cat-herder.config.js]
                Orchestrator -- Loops through steps --> StepRunner[Execute Single Step]
                StepRunner -- Calls --> Proc[Process Runner (proc.ts)]
                Proc -- Spawns --> ClaudeCLI[Claude CLI]
                Orchestrator -- Reads/Writes --> State[State Files]
            ```