

# PLAN.md

## Title & Goal

**Title:** Implement Multi-Pipeline Support

**Goal:** Allow users to define multiple, named pipelines in their configuration file and select which one to use for a given task.

---

## Description

Currently, the `claude.config.js` file only supports a single `pipeline` array. This is inflexible for projects that might need different workflows, such as a full TDD-style pipeline for new features versus a simpler, docs-only pipeline for documentation changes.

This change will introduce a new `pipelines` object in the configuration, where users can define multiple named workflows. The system will use a clear priority system to select which pipeline to run for a given task: a CLI flag will have the highest priority, followed by a specification in the task file's frontmatter, then a configured default, and finally, the first pipeline available.

---

## Summary Checklist

-   [x] **Configuration:** Update the config schema and template to support a `pipelines` object and a `defaultPipeline` key.
-   [x] **CLI:** Add a `--pipeline <name>` option to the `run` command.
-   [x] **Task Parsing:** Add logic to parse a `pipeline` key from a task file's YAML frontmatter.
-   [ ] **Orchestrator:** Implement the core logic to select and execute the correct pipeline based on the new priority rules.
-   [ ] **State:** Update the task status file to record which pipeline was used.
-   [ ] **Validation:** Upgrade the validator to check all defined pipelines for correctness.
-   [ ] **Dependencies:** Add `js-yaml` as a direct dependency for parsing frontmatter.
-   [ ] **Documentation:** Update `README.md` to explain the new multi-pipeline feature.

---

## Detailed Implementation Steps

### 1. Update Configuration Schema and Template

*   **Objective:** Modify the configuration structure to support multiple named pipelines.
*   **Tasks:**
    1.  In `src/config.ts`, update the `ClaudeProjectConfig` interface and the `getConfig` function to handle the new structure.
    2.  In `src/templates/claude.config.js`, replace the old `pipeline` array with the new `pipelines` object structure.

*   **Code Snippet (`src/config.ts`):**

    ```typescript
    import { cosmiconfig } from "cosmiconfig";
    import path from "node:path";
    import { CheckConfig } from "./tools/check-runner.js";

    // Define the structure of a pipeline step
    export interface PipelineStep {
      name: string;
      command: string;
      check: CheckConfig;
      fileAccess?: {
        allowWrite?: string[];
      };
    }

    type PipelinesMap = { [key: string]: PipelineStep[] };

    // This is the type definition for the user's claude.config.js file
    export interface ClaudeProjectConfig {
      taskFolder: string;
      statePath: string;
      logsPath: string;
      structureIgnore: string[];
      manageGitBranch?: boolean;
      pipelines: PipelinesMap;
      defaultPipeline?: string;
    }

    // Default configuration if the user's file is missing parts
    const defaultConfig: Omit<ClaudeProjectConfig, "pipelines" | "defaultPipeline"> = {
      taskFolder: "claude-Tasks",
      statePath: ".claude/state",
      logsPath: ".claude/logs",
      structureIgnore: [
        "node_modules/**", ".git/**", "dist/**", ".claude/**", "*.lock",
      ],
      manageGitBranch: true,
    };

    let loadedConfig: ClaudeProjectConfig | null = null;
    let projectRoot: string | null = null;

    export async function getConfig(): Promise<ClaudeProjectConfig> {
      if (loadedConfig) return loadedConfig;

      const explorer = cosmiconfig("claude");
      const result = await explorer.search();

      if (!result) {
        console.error("Error: Configuration file (claude.config.js) not found.");
        console.error("Please run `claude-project init` in your project root.");
        process.exit(1);
      }

      projectRoot = path.dirname(result.filepath);
      const userConfig = result.config as any;

      let pipelines: PipelinesMap = userConfig.pipelines || {};

      // Handle backward compatibility for the old `pipeline` array format
      if (userConfig.pipeline && Object.keys(pipelines).length === 0) {
        pipelines = { default: userConfig.pipeline };
      }
      
      let defaultPipeline = userConfig.defaultPipeline;
      // If no default is set, use the first pipeline as the default
      if (!defaultPipeline && Object.keys(pipelines).length > 0) {
        defaultPipeline = Object.keys(pipelines)[0];
      }
      
      const finalConfig: ClaudeProjectConfig = { 
        ...defaultConfig, 
        ...userConfig,
        pipelines,
        defaultPipeline,
      };

      // Clean up the old property if it exists
      delete (finalConfig as any).pipeline;

      loadedConfig = finalConfig;
      return loadedConfig;
    }

    // Utility to get the project root after config is loaded
    export function getProjectRoot() {
      if (!projectRoot) {
        throw new Error("Project root not determined. Call getConfig() first.");
      }
      return projectRoot;
    }

    // Utility to get a path to a command template inside the global package
    export function getCommandTemplatePath(commandName: string): string {
        return path.resolve(new URL(`./dot-claude/commands/${commandName}.md`, import.meta.url).pathname);
    }
    ```

*   **Code Snippet (`src/templates/claude.config.js`):**

    ```javascript
    // claude.config.js
    /** @type {import('@your-scope/claude-project').ClaudeProjectConfig} */
    module.exports = {
      taskFolder: "claude-Tasks",
      statePath: ".claude/state",
      logsPath: ".claude/logs",
      structureIgnore: [
        "node_modules/**",
        ".git/**",
        "dist/**",
        ".claude/**",
        "*.lock",
      ],
      manageGitBranch: true,
      defaultPipeline: 'default',
      pipelines: {
        default: [
          {
            name: "plan",
            command: "plan-task",
            check: { type: "fileExists", path: "PLAN.md" },
            fileAccess: { allowWrite: ["PLAN.md"] }
          },
          {
            name: "write_tests",
            command: "write-tests",
            check: { type: "shell", command: "npm test", expect: "fail" },
            fileAccess: { allowWrite: ["test/**/*", "tests/**/*"] }
          },
          {
            name: "implement",
            command: "implement",
            check: { type: "shell", command: "npm test", expect: "pass" },
            fileAccess: { allowWrite: ["src/**/*"] }
          },
          {
            name: "docs",
            command: "docs-update",
            check: { type: "none" },
            fileAccess: { allowWrite: ["README.md", "docs/**/*", "*.md"] }
          },
          {
            name: "review",
            command: "self-review",
            check: { type: "none" },
          },
        ],
        /*
        "docs-only": [
           {
            name: "docs",
            command: "docs-update",
            check: { type: "none" },
            fileAccess: { allowWrite: ["README.md", "docs/**/*", "*.md"] }
          }
        ]
        */
      },
    };
    ```

### 2. Enhance the CLI

*   **Objective:** Allow users to specify a pipeline from the command line.
*   **Code Snippet (`src/index.ts`):**

    ```typescript
    // ... imports

    // `run` command
    program
      .command("run <taskPath>")
      .description("Runs the automated workflow for a specific task file.")
      .option("-p, --pipeline <name>", "Specify the pipeline to run, overriding config and task defaults.")
      .action(async (taskPath, options) => {
        try {
          await runTask(taskPath, options.pipeline);
        } catch (error: any) {
          console.error(pc.red(`\nWorkflow failed: ${error.message}`));
          process.exit(1);
        }
      });

    // ... other commands
    ```

### 3. Parse Pipeline from Task Frontmatter

*   **Objective:** Read the `pipeline` key from a task file.
*   **Code Snippet (add to `src/tools/orchestrator.ts`):**

    ```typescript
    import yaml from 'js-yaml';

    function parseTaskFrontmatter(content: string): { pipeline?: string; body: string } {
      const match = content.match(/^---\s*([\s\S]+?)\s*---/);
      if (match) {
        try {
          const frontmatter = yaml.load(match[1]) as Record<string, any> | undefined;
          const body = content.substring(match[0].length).trim();
          return { pipeline: frontmatter?.pipeline, body };
        } catch {
          return { body: content };
        }
      }
      return { body: content };
    }
    ```

### 4. Implement Pipeline Selection in Orchestrator

*   **Objective:** Choose the correct pipeline to execute.
*   **Code Snippet (update `runTask` in `src/tools/orchestrator.ts`):**

    ```typescript
    export async function runTask(taskRelativePath: string, pipelineOption?: string) {
      const config = await getConfig();
      // ...
      const rawTaskContent = readFileSync(path.resolve(projectRoot, taskRelativePath), 'utf-8');
      const { pipeline: taskPipelineName, body: taskContent } = parseTaskFrontmatter(rawTaskContent);

      const pipelineName = pipelineOption || taskPipelineName || config.defaultPipeline || Object.keys(config.pipelines)[0];
      
      if (!pipelineName || !config.pipelines[pipelineName]) {
        throw new Error(`Pipeline "${pipelineName}" not found in claude.config.js. Available: ${Object.keys(config.pipelines).join(', ')}`);
      }
      const selectedPipeline = config.pipelines[pipelineName];
      
      if (pipelineOption) console.log(pc.cyan(`[Orchestrator] Using pipeline from --pipeline option: "${pipelineName}"`));
      else if (taskPipelineName) console.log(pc.cyan(`[Orchestrator] Using pipeline from task frontmatter: "${pipelineName}"`));
      else console.log(pc.cyan(`[Orchestrator] Using default pipeline: "${pipelineName}"`));
      
      // ... rest of the function using selectedPipeline
    }
    ```

### 5. Update Task Status

*   **Objective:** Record the active pipeline in the state file.
*   **Code Snippet (`src/tools/status.ts`):**

    ```typescript
    export type TaskStatus = {
      version: number;
      taskId: string;
      branch: string;
      pipeline?: string; // Add this line
      currentStep: string;
      phase: Phase;
      steps: Record<string, Phase>;
      lastUpdate: string;
      prUrl?: string;
      lastCommit?: string;
    };
    ```
*   **Code Snippet (update `runTask` in `src/tools/orchestrator.ts`):**
    ```typescript
    //...
    updateStatus(statusFile, s => {
      s.taskId = taskId;
      s.branch = branchName;
      s.pipeline = pipelineName; // Add this line
    });
    //...
    ```

### 6. Upgrade the Validator

*   **Objective:** Validate all pipelines defined in the configuration.
*   **Code Snippet (`src/tools/validator.ts`):**

    ```typescript
    // ... imports and helper functions

    export function validateConfig(config: ClaudeProjectConfig, projectRoot: string): ValidationResult {
      const errors: string[] = [];
      const missingPermissions: string[] = [];
      const validCheckTypes = ["none", "fileExists", "shell"];

      // ... (permission loading logic remains the same) ...

      if (!config.pipelines || typeof config.pipelines !== 'object' || Object.keys(config.pipelines).length === 0) {
        errors.push("Configuration is missing a 'pipelines' object with at least one defined pipeline.");
        return { isValid: false, errors, missingPermissions };
      }
    
      if (config.defaultPipeline && !config.pipelines[config.defaultPipeline]) {
        errors.push(`The defaultPipeline "${config.defaultPipeline}" is not defined in the 'pipelines' object.`);
      }
    
      for (const [pipelineName, pipeline] of Object.entries(config.pipelines)) {
        if (!Array.isArray(pipeline)) {
          errors.push(`Pipeline "${pipelineName}" is not a valid array of steps.`);
          continue;
        }
    
        for (const [index, step] of pipeline.entries()) {
          const stepId = `Pipeline '${pipelineName}', Step ${index + 1} ('${step.name || `unnamed`}')`;
    
          if (!step.name) errors.push(`Pipeline '${pipelineName}', Step ${index + 1}: is missing the 'name' property.`);
          if (!step.command) {
            errors.push(`${stepId}: is missing the 'command' property.`);
            continue; 
          }
          // ... (rest of the step validation logic for command files, permissions, etc.)
        }
      }

      return { 
        isValid: errors.length === 0, 
        errors,
        missingPermissions: [...new Set(missingPermissions)],
      };
    }
    ```

### 7. Add `js-yaml` Dependency

*   **Objective:** Ensure the project has the necessary library to parse YAML frontmatter.
*   **Code Snippet (`package.json`):**

    ```json
    "dependencies": {
      "chokidar": "^4.0.3",
      "commander": "^14.0.0",
      "cosmiconfig": "^9.0.0",
      "fs-extra": "^11.3.0",
      "js-yaml": "^4.1.0",
      "minimatch": "^10.0.3",
      "picocolors": "^1.1.1"
    },
    "devDependencies": {
      // ...
      "@types/js-yaml": "^4.0.9",
      // ...
    },
    ```

### 8. Update Documentation

*   **Objective:** Explain the new multi-pipeline feature in the `README.md`.
*   **Code Snippet (for `README.md`):**

    ```markdown
    ## How It Works

    ### Configurable Pipelines (`claude.config.js`)

    This tool is driven by a `pipelines` object in your `claude.config.js` file. You can define multiple workflows for different kinds of tasks.

    ```javascript
    // claude.config.js
    module.exports = {
      // ... other settings
      defaultPipeline: 'default',

      pipelines: {
        default: [
          {
            name: "plan",
            command: "plan-task",
            check: { type: "fileExists", path: "PLAN.md" },
          },
          // ... more steps
        ],
        "docs-only": [
           {
            name: "docs",
            command: "docs-update",
            check: { type: "none" },
          }
        ]
      },
    };
    ```

    **Pipeline Selection:**

    The orchestrator selects a pipeline in the following order of priority:
    1.  **CLI Flag:** `claude-project run <task> --pipeline <name>`
    2.  **Task Frontmatter:** Add a `pipeline:` key to your task's YAML frontmatter.
        ```markdown
        ---
        pipeline: docs-only
        ---
        # My Documentation Task
        ...
        ```
    3.  **Configuration Default:** The `defaultPipeline` property in `claude.config.js`.
    4.  **First Available:** The first pipeline defined in the `pipelines` object if no default is specified.

    ## Commands Reference
    
    ### CLI Commands
    
    -   `claude-project run <path-to-task.md>`: Runs the full workflow for a specific task.
        -   `--pipeline <name>`: Specifies which pipeline to use.

    ```