
# PLAN.md

### **Title**: Refactor Prompt Assembly and Simplify Configuration

### **Goal**
To simplify the prompt generation logic by removing the `context` array from the `claude.config.js` and assembling a more structured, consistent prompt in the orchestrator, while also deprecating the `projectStructure` context provider.

### **Description**
The current implementation requires users to manually specify which context (like the task definition or plan content) should be included for each step in the `claude.config.js` file. This is repetitive, prone to error, and adds unnecessary complexity. Furthermore, the `projectStructure` provider can create overly large and inefficient prompts.

This change will refactor the system to build a standardized, more intelligent prompt for every step. This new prompt will automatically include the most critical information—such as the overall pipeline, the current step's role, and the task definition—without requiring any user configuration. This will result in a simpler `claude.config.js`, a more robust workflow, and a better experience for the AI agent.

### **Summary Checklist**

-   [x] **Configuration**: Update `src/config.ts` to remove the `context` property from the `PipelineStep` interface.
-   [x] **Orchestration**: Refactor `src/tools/orchestrator.ts` to implement the new, standardized prompt assembly logic.
-   [x] **Providers**: Simplify `src/tools/providers.ts` by removing the `projectStructure` provider. *(Already completed)*
-   [x] **Templates**: Update `src/templates/claude.config.js` to remove all `context` arrays from the default pipeline steps.
-   [x] **Prompts**: Update the `src/dot-claude/commands/plan-task.md` prompt to reflect the removal of the `projectStructure` context.
-   [ ] **Documentation**: Update the main `README.md` to reflect the simplified configuration and new prompt logic.

### **Detailed Implementation Steps**

#### 1. Update `src/config.ts`
*   **Objective**: Remove the now-redundant `context` property from the user-facing configuration to simplify the `claude.config.js` file.
*   **Task**:
    1.  Open the `src/config.ts` file.
    2.  Locate the `PipelineStep` interface.
    3.  Delete the `context: string[];` line from the interface.

*   **Code Snippet** (Before):
    ```typescript
    export interface PipelineStep {
      name: string;
      command: string;
      context: string[]; // <-- DELETE THIS LINE
      check: CheckConfig;
      fileAccess?: {
        allowWrite?: string[];
      };
    }
    ```
*   **Code Snippet** (After):
    ```typescript
    export interface PipelineStep {
      name: string;
      command: string;
      check: CheckConfig;
      fileAccess?: {
        allowWrite?: string[];
      };
    }
    ```

#### 2. Update `src/tools/orchestrator.ts`
*   **Objective**: Implement a centralized function that assembles a complete and informative prompt for the AI, independent of user configuration.
*   **Task**:
    1.  Open `src/tools/orchestrator.ts`.
    2.  Create a new function called `assemblePrompt` that takes the entire pipeline, the current step's name, the context data, and the command instructions as arguments. This function will build a detailed prompt string.
    3.  In the `runTask` function, modify the main loop to use this new `assemblePrompt` function. The logic for gathering context will now be handled inside the orchestrator instead of being driven by the config file.

*   **Code Snippet** (New Function):
    ```typescript
    function assemblePrompt(
      pipeline: PipelineStep[],
      currentStepName: string,
      context: Record<string, string>,
      commandInstructions: string
    ): string {
      const intro = `Here is a task that has been broken down into several steps. You are an autonomous agent responsible for completing one step at a time.`;
      const pipelineStepsList = pipeline.map((step, index) => `${index + 1}. ${step.name}`).join('\n');
      const pipelineContext = `This is the full pipeline for your awareness:\n${pipelineStepsList}`;
      const responsibility = `You are responsible for executing step "${currentStepName}".`;
      
      let contextString = "";
      for (const [title, content] of Object.entries(context)) {
        contextString += `--- ${title.toUpperCase()} ---\n\`\`\`\n${content.trim()}\n\`\`\`\n\n`;
      }
      if (contextString) {
          contextString = contextString.trim();
      }

      return [
        intro,
        pipelineContext,
        responsibility,
        contextString,
        `--- YOUR INSTRUCTIONS FOR THE "${currentStepName}" STEP ---`,
        commandInstructions,
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    ```

#### 3. Update `src/tools/providers.ts`
*   **Objective**: Remove the `projectStructure` provider to streamline prompts and encourage the AI to use its built-in filesystem tools.
*   **Task**:
    1.  Open `src/tools/providers.ts`.
    2.  Delete the `projectStructure` property and its associated function from the `contextProviders` object.

*   **Code Snippet** (Before):
    ```typescript
    export const contextProviders: Record<string, (projectRoot: string, taskContent: string) => string> = {
      projectStructure: (projectRoot) => { /* ... implementation ... */ }, // <-- DELETE THIS
      taskDefinition: (_projectRoot, taskContent) => taskContent,
      planContent: (projectRoot) => { /* ... implementation ... */ },
    };
    ```
*   **Code Snippet** (After):
    ```typescript
    export const contextProviders: Record<string, (projectRoot: string, taskContent: string) => string> = {
      taskDefinition: (_projectRoot, taskContent) => taskContent,
      planContent: (projectRoot) => { /* ... implementation ... */ },
    };
    ```

#### 4. Update `src/templates/claude.config.js`
*   **Objective**: Align the default configuration template with the new, simplified structure.
*   **Task**:
    1.  Open `src/templates/claude.config.js`.
    2.  For each step defined in the `pipeline` array, remove the `context` property.

*   **Code Snippet** (Example for the "plan" step, Before):
    ```javascript
    {
      name: "plan",
      command: "plan-task",
      context: ["projectStructure", "taskDefinition"], // <-- DELETE THIS LINE
      check: { type: "fileExists", path: "PLAN.md" },
      fileAccess: {
        allowWrite: ["PLAN.md"]
      }
    },
    ```*   **Code Snippet** (Example for the "plan" step, After):
    ```javascript
    {
      name: "plan",
      command: "plan-task",
      check: { type: "fileExists", path: "PLAN.md" },
      fileAccess: {
        allowWrite: ["PLAN.md"]
      }
    },
    ```

#### 5. Update `src/dot-claude/commands/plan-task.md`
*   **Objective**: Update the AI's instructions to reflect the removal of the `projectStructure` context, guiding it to use its tools for discovery.
*   **Task**:
    1.  Open `src/dot-claude/commands/plan-task.md`.
    2.  Modify the main instruction to ask the AI to explore the project structure using its available tools if necessary.

*   **Code Snippet** (New Instruction):
    ```markdown
    Based on the task definition provided, and by exploring the project files if needed, create a clear, step-by-step implementation plan.
    ```

### **Error Handling & Warnings**
*   **Backward Compatibility**: The new orchestrator will simply ignore the `context` property if it exists in a user's old `claude.config.js` file. This prevents the tool from breaking for existing users, though they will benefit from updating their configuration to the new, cleaner format.
*   **Validation**: The existing `validate` command will no longer check for the `context` property. Ensure that any logic related to `context` validation in `src/tools/validator.ts` is removed.

### **Documentation Changes**
*   **Objective**: Update the `README.md` to reflect the simplified configuration and provide a clear explanation of how the new prompt system works.
*   **Task**:
    1.  Open `README.md`.
    2.  In the "How It Works" section, update the example of `claude.config.js` to remove the `context` property from all pipeline steps.
    3.  Remove the "Available Context Providers" section entirely.
    4.  Add a brief explanation stating that the orchestrator now automatically assembles the necessary context for each step, ensuring the AI always has the information it needs.
    5.  Search for any other mentions of the `context` property or the `projectStructure` provider and remove or update them to align with the new design.