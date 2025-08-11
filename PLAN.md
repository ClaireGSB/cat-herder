
# PLAN: Implement Per-Step Model Selection

## Goal

To allow users to specify which Claude model to use for each individual step of a pipeline via the project configuration.

## Description

Currently, the `claude-project` tool executes all steps using the default model configured in the system's `claude` CLI. This lacks flexibility, as users may want to use a powerful model like Opus for complex tasks (e.g., implementation) and a faster, more cost-effective model like Haiku for simpler tasks (e.g., updating documentation) within the same workflow.

This change will introduce a new optional `model` property to the step definition in `claude.config.js`. When the orchestrator executes a step, it will check for this property. If a model is specified, the orchestrator will pass the `--model <model_name>` flag to the underlying `claude` process. If it's not specified, the system will continue to use the default behavior, allowing for backward compatibility.

## Summary Checklist

- [x] Update configuration interfaces in `src/config.ts` to include the `model` property.
- [ ] Implement the core logic in `src/tools/orchestrator.ts` and `src/tools/proc.ts` to pass the model to the CLI.
- [ ] Enhance `claude-project validate` to check for valid model names.
- [ ] Add unit tests to `test/validator.test.ts` for the new validation logic.
- [ ] Update user-facing documentation (`README.md`) and configuration templates (`src/templates/claude.config.js`).

---

## Detailed Implementation Steps

### 1. Update Configuration Interfaces

*   **Objective:** Define the shape of the new `model` property in our TypeScript interfaces.
*   **Task:**
    1.  Open `src/config.ts`.
    2.  Add an optional `model` property of type `string` to the `PipelineStep` interface.

*   **Code Snippet (`src/config.ts`):**

    ```typescript
    // Before
    export interface PipelineStep {
      name: string;
      command: string;
      check: CheckConfig | CheckConfig[];
      fileAccess?: {
        allowWrite?: string[];
      };
      retry?: number;
    }

    // After
    export interface PipelineStep {
      name: string;
      command: string;
      model?: string; // Add this line
      check: CheckConfig | CheckConfig[];
      fileAccess?: {
        allowWrite?: string[];
      };
      retry?: number;
    }
    ```

### 2. Implement Model-Passing Logic

*   **Objective:** Modify the process-spawning logic to include the `--model` flag when a model is specified.
*   **Tasks:**
    1.  **Orchestrator:** In `src/tools/orchestrator.ts`, update the `executeStep` function to read the `model` from its `stepConfig` argument and pass it to `runStreaming`.
    2.  **Process Spawner:** In `src/tools/proc.ts`, update the `runStreaming` function to accept an optional `model` parameter. If the parameter is provided, add `"--model", model` to the arguments list for the `spawn` command.

*   **Code Snippet 1 (`src/tools/orchestrator.ts`):**

    ```typescript
    // In executeStep function
    async function executeStep(...) {
        // ...
        const { name, command, check, retry, model } = stepConfig; // Destructure model
        // ...
        // Update the call to runStreaming
        const result = await runStreaming("claude", [`/project:${command}`], logFile, reasoningLogFile, projectRoot, currentPrompt, rawJsonLogFile, model); // Pass model
        // ...
    }
    ```

*   **Code Snippet 2 (`src/tools/proc.ts`):**

    ```typescript
    // Update runStreaming function signature
    export function runStreaming(
      cmd: string,
      args: string[],
      logPath: string,
      reasoningLogPath: string,
      cwd: string,
      stdinData?: string,
      rawJsonLogPath?: string,
      model?: string // Add model parameter
    ): Promise<StreamResult> {
      // Build final args
      const finalArgs = [...args, "--output-format", "stream-json", "--verbose"];

      // Conditionally add the model flag
      if (model) {
        finalArgs.push("--model", model);
      }

      console.log(`[Proc] Spawning: ${cmd} ${finalArgs.join(" ")}`);
      // ... rest of the function
    }
    ```

### 3. Enhance Pipeline Validator

*   **Objective:** Ensure that users provide valid model names in their configuration to prevent runtime errors.
*   **Tasks:**
    1.  Open `src/tools/validator.ts`.
    2.  Create a constant array named `VALID_CLAUDE_MODELS` containing all valid model strings.
    3.  In the `validatePipeline` function, iterate through each step of each pipeline.
    4.  If a `step.model` property exists, check if its value is included in the `VALID_CLAUDE_MODELS` array.
    5.  If it's not a valid model, add a descriptive error message to the `errors` array.

*   **Code Snippet (`src/tools/validator.ts`):**

    ```typescript
    // Add this list at the top of the file
    const VALID_CLAUDE_MODELS = [
      "claude-opus-4-1-20250805",
      "claude-opus-4-20250514",
      "claude-sonnet-4-20250514",
      "claude-3-7-sonnet-20250219",
      "claude-3-5-haiku-20241022",
    ];

    // Inside the validatePipeline function, in the step validation loop
    for (const [index, step] of pipeline.entries()) {
        const stepId = `Pipeline '${pipelineName}', Step ${index + 1} ('${step.name || 'unnamed'}')`;
        // ... other validations

        // Add this new validation block
        if (step.model !== undefined) {
          if (typeof step.model !== 'string') {
            errors.push(`${stepId}: The 'model' property must be a string.`);
          } else if (!VALID_CLAUDE_MODELS.includes(step.model)) {
            errors.push(`${stepId}: Invalid model name "${step.model}". Available models are: ${VALID_CLAUDE_MODELS.join(", ")}`);
          }
        }
    }
    ```

### 4. Add Unit Tests

*   **Objective:** Verify that the validation logic correctly identifies valid and invalid model configurations.
*   **Task:**
    1.  Open `test/validator.test.ts`.
    2.  Add new test cases to check the validator's behavior with the `model` property.
    3.  Test for:
        *   A valid model name.
        *   An invalid/misspelled model name.
        *   A step with no `model` property (should pass).
        *   A `model` property with a non-string value (e.g., a number).

*   **Code Snippet (`test/validator.test.ts`):**

    ```typescript
    // Example test case using vitest
    it('should fail validation for a step with an invalid model name', () => {
      const config = {
        pipelines: {
          default: [{
            name: 'test-step',
            command: 'plan-task',
            model: 'claude-opus-9000', // Invalid model
            check: { type: 'none' },
          }],
        },
      };
      const { isValid, errors } = validatePipeline(config, '/fake/project');
      expect(isValid).toBe(false);
      expect(errors).toContain(expect.stringContaining('Invalid model name "claude-opus-9000"'));
    });
    ```

## Error Handling & Warnings

*   **Primary Validation:** The `claude-project validate` command is the user's first line of defense.
*   **Error Message:** When validation fails due to an incorrect model name, the CLI should output a clear error message.
    *   **Example:** `✖ Pipeline configuration is invalid: - Pipeline 'default', Step 1 ('plan'): Invalid model name "claude-4-opus". Available models are: claude-opus-4-1-20250805, claude-opus-4-20250514, ...`
*   **No Fallback:** The system should not attempt to "guess" a correct model. An invalid name is a configuration error and should halt the process until fixed.

## Documentation Changes

*   **Objective:** Inform users how to use the new feature.
*   **Tasks:**
    1.  **Update Config Template:** Edit `src/templates/claude.config.js` to include an example of the `model` property on a pipeline step, with comments explaining its usage.
    2.  **Update README:** Edit `README.md`. In the `How It Works` section, under the `Configurable Pipelines (claude.config.js)` subsection, add a paragraph explaining the new `model` property and provide a small example.

*   **Code Snippet (`src/templates/claude.config.js`):**

    ```javascript
    // In the default pipeline array
    {
      name: "implement",
      command: "implement",
      // You can optionally specify a model for a specific step.
      // If omitted, it uses the Claude CLI's default model.
      // model: "claude-opus-4-1-20250805",
      check: { type: "shell", command: "npm test", expect: "pass" },
      fileAccess: {
        allowWrite: ["src/**/*"]
      },
      retry: 3
    },
    ```