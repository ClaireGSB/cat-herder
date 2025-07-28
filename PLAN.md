
# Implementation Plan: Configurable Pipeline

### Goal

To refactor the hardcoded workflow in the orchestrator into a dynamic, user-configurable pipeline defined in `claude.config.js`. This will decouple the orchestration logic from the specific steps, empowering users to easily customize, reorder, and extend their development workflow.

### Description

Currently, the sequence of "plan -> write_tests -> implement..." is hardcoded directly into `orchestrator.ts`. This is rigid and difficult to maintain or extend.

This initiative will move the definition of the pipeline into the user's `claude.config.js` file. The orchestrator will be rewritten to simply read this pipeline and execute the steps in a loop. Each step in the configuration will be a descriptive object, defining its name, the command to run, the context it needs, and a clear, readable validation check.

We will also introduce a `claude-project validate` command to act as a "linter" for the user's pipeline configuration, providing a crucial safety net and an excellent developer experience. This same validation will run silently every time a task is executed to prevent errors before they start.

---

## Summary Checklist

-   [x] **Step 1:** Update the Configuration Template (`claude.config.js`)
-   [x] **Step 2:** Create Context and Check Providers
-   [x] **Step 3:** Implement the Centralized Pipeline Validator
-   [x] **Step 4:** Refactor the Orchestrator to be Pipeline-Driven
-   [ ] **Step 5:** Implement the `claude-project validate` Command
-   [ ] **Step 6:** Integrate Silent Validation into the `run` Command
-   [ ] **Step 7:** Update the `README.md` Documentation

---

## Detailed Implementation Steps

### Step 1: Update the Configuration Template

**Objective:** Define the new, user-friendly `pipeline` array structure in the default configuration file that users will see and edit.

**Task:** Replace the contents of `src/templates/claude.config.js` with the new structure.

**File: `src/templates/claude.config.js`**
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

  /**
   * Defines the sequence of steps in the development workflow.
   * The orchestrator will execute these steps in order.
   */
  pipeline: [
    {
      name: "plan",
      command: "plan-task",
      context: ["projectStructure", "taskDefinition"],
      // Check that the PLAN.md file was created.
      check: { type: "fileExists", path: "PLAN.md" },
    },
    {
      name: "write_tests",
      command: "write-tests",
      context: ["planContent", "taskDefinition"],
      // Check that tests were written AND that they fail as expected.
      check: { type: "shell", command: "npm test", expect: "fail" },
    },
    {
      name: "implement",
      command: "implement",
      context: ["planContent"],
      // Check that the tests now pass.
      check: { type: "shell", command: "npm test", expect: "pass" },
    },
    {
      name: "docs",
      command: "docs-update",
      context: ["planContent", "projectStructure"],
      // No automated check for documentation; this is a manual review step.
      check: { type: "none" },
    },
    {
      name: "review",
      command: "self-review",
      context: [],
      check: { type: "none" },
    },
  ],
};
```

### Step 2: Create Context and Check Providers

**Objective:** Decouple the logic for gathering context and running checks from the main orchestrator.

**Tasks:**
1.  Create a new file `src/tools/providers.ts` to manage how context (like `projectStructure`) is gathered.
2.  Create a new file `src/tools/check-runner.ts` to interpret and execute the `check` objects from the config.

**File: `src/tools/providers.ts` (New File)**
```typescript
import { readFileSync } from "node:fs";
import path from "node:path";
import { glob } from "glob";

/**
 * A map of context keys to functions that return the context data as a string.
 * This allows the orchestrator to dynamically build the context for each step.
 */
export const contextProviders: Record<string, (projectRoot: string, taskContent: string) => string> = {
  projectStructure: (projectRoot) => {
    const files = glob.sync("**/*", { 
      cwd: projectRoot, 
      ignore: ["node_modules/**", ".git/**", "dist/**", ".claude/**", "*.lock"], 
      nodir: true, 
      dot: true 
    });
    return files.join("\n");
  },
  taskDefinition: (_projectRoot, taskContent) => taskContent,
  planContent: (projectRoot) => {
    const planPath = path.join(projectRoot, "PLAN.md");
    // This provider assumes the file exists because the 'plan' step should have already created it.
    return readFileSync(planPath, 'utf-8');
  },
};
```

**File: `src/tools/check-runner.ts` (New File)**
```typescript
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";

// Define the structure of a check object from the config
export type CheckConfig = {
  type: "none" | "fileExists" | "shell";
  path?: string;
  command?: string;
  expect?: "pass" | "fail";
};

/**
 * Executes a validation check based on a configuration object.
 */
export async function runCheck(checkConfig: CheckConfig, projectRoot: string) {
  console.log(`[Orchestrator] Running check: ${pc.yellow(checkConfig.type)}`);

  switch (checkConfig.type) {
    case "none":
      console.log(pc.gray("  › No automated validation for this step."));
      return;

    case "fileExists":
      if (!checkConfig.path) throw new Error("Check type 'fileExists' requires a 'path' property.");
      const filePath = path.join(projectRoot, checkConfig.path);
      if (!existsSync(filePath)) throw new Error(`Validation failed: File not found at ${filePath}`);
      console.log(pc.green(`  ✔ Check passed: File "${checkConfig.path}" exists.`));
      return;

    case "shell":
      if (!checkConfig.command) throw new Error("Check type 'shell' requires a 'command' property.");
      const expect = checkConfig.expect || "pass";
      console.log(`  › Executing: "${checkConfig.command}" (expecting to ${expect})`);

      try {
        execSync(checkConfig.command, { stdio: "pipe", cwd: projectRoot });
        if (expect === "fail") throw new Error(`Validation failed: Command "${checkConfig.command}" succeeded but was expected to fail.`);
        console.log(pc.green(`  ✔ Check passed: Command succeeded as expected.`));
      } catch (error) {
        if (expect === "pass") {
          console.error(pc.red(`  ✖ Check failed: Command "${checkConfig.command}" failed but was expected to pass.`));
          if (error instanceof Error && 'stderr' in error) console.error(pc.gray((error as any).stderr.toString()));
          throw error;
        }
        console.log(pc.green(`  ✔ Check passed: Command failed as expected.`));
      }
      return;

    default:
      throw new Error(`Unknown check type: ${(checkConfig as any).type}`);
  }
}```

### Step 3: Implement the Centralized Pipeline Validator

**Objective:** Create a reusable function that can analyze a user's pipeline configuration and report any errors.

**Task:** Create a new file `src/tools/validator.ts`.

**File: `src/tools/validator.ts` (New File)**
```typescript
import fs from "fs";
import path from "path";
import { ClaudeProjectConfig } from "../config.js";
import { contextProviders } from "./providers.js";

/**
 * Validates a pipeline configuration against available commands and providers.
 * @returns An object with an `isValid` boolean and an array of error strings.
 */
export function validatePipeline(config: ClaudeProjectConfig, projectRoot: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const knownContextKeys = Object.keys(contextProviders);
  const validCheckTypes = ["none", "fileExists", "shell"];

  if (!config.pipeline || !Array.isArray(config.pipeline)) {
    errors.push("Configuration is missing a valid 'pipeline' array.");
    return { isValid: false, errors };
  }

  for (const [index, step] of config.pipeline.entries()) {
    const stepNum = index + 1;

    if (!step.command) {
        errors.push(`Step ${stepNum} ('${step.name}'): is missing the 'command' property.`);
        continue; // Skip further checks for this malformed step
    }

    const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
    if (!fs.existsSync(commandFilePath)) {
      errors.push(`Step ${stepNum} ('${step.name}'): Command file not found at .claude/commands/${step.command}.md`);
    }

    for (const contextKey of step.context) {
      if (!knownContextKeys.includes(contextKey)) {
        errors.push(`Step ${stepNum} ('${step.name}'): Unknown context provider '${contextKey}'. Available: ${knownContextKeys.join(", ")}`);
      }
    }
    
    if (!step.check || !step.check.type) {
        errors.push(`Step ${stepNum} ('${step.name}'): is missing a valid 'check' object with a 'type' property.`);
        continue;
    }

    if (!validCheckTypes.includes(step.check.type)) {
      errors.push(`Step ${stepNum} ('${step.name}'): Invalid check type '${step.check.type}'. Available: ${validCheckTypes.join(", ")}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}
```

### Step 4 & 5 are combined in the new orchestrator

### Step 4: Refactor the Orchestrator to be Pipeline-Driven & Integrate Silent Validation

**Objective:** Replace the hardcoded `if` statements with a dynamic loop that reads the pipeline from the config. Also, add the silent validation check at the very beginning of the `runTask` function.

**Task:** Completely replace the contents of `src/tools/orchestrator.ts`.

**File: `src/tools/orchestrator.ts` (Completely Replaced)**
```typescript
import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { runStreaming } from "./proc.js";
import { updateStatus, readStatus, TaskStatus } from "./status.js";
import { getConfig, getProjectRoot } from "../config.js";
import { runCheck, CheckConfig } from "./check-runner.js";
import { contextProviders } from "./providers.js";
import { validatePipeline } from "./validator.js";

async function executeStep(
  name: string,
  command: string,
  fullPrompt: string,
  statusFile: string,
  logFile: string,
  check: CheckConfig
) {
  const projectRoot = getProjectRoot();
  console.log(pc.blue(`\n[Orchestrator] Starting step: ${name}`));
  updateStatus(statusFile, s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });

  const { code } = await runStreaming("claude", [`/project:${command}`], logFile, projectRoot, fullPrompt);
  if (code !== 0) {
    updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
    throw new Error(`Step "${name}" failed. Check log for details: ${logFile}`);
  }

  await runCheck(check, projectRoot);

  console.log(`[Orchestrator] Committing checkpoint for step: ${name}`);
  execSync(`git add -A`, { stdio: "inherit", cwd: projectRoot });
  execSync(`git commit -m "chore(${name}): checkpoint"`, { stdio: "inherit", cwd: projectRoot });
  updateStatus(statusFile, s => { s.phase = "pending"; s.steps[name] = "done"; });
}

export async function runTask(taskRelativePath: string) {
  const config = await getConfig();
  const projectRoot = getProjectRoot();

  // --- IMPLICIT VALIDATION STEP (Step 5) ---
  const { isValid, errors } = validatePipeline(config, projectRoot);
  if (!isValid) {
    console.error(pc.red("✖ Your pipeline configuration is invalid. Cannot run task.\n"));
    for (const error of errors) console.error(pc.yellow(`  - ${error}`));
    console.error(pc.cyan("\nPlease fix the errors in 'claude.config.js' or run 'claude-project validate' for details."));
    process.exit(1);
  }

  console.log(pc.cyan(`Project root identified: ${projectRoot}`));

  const taskId = path.basename(taskRelativePath, '.md').replace(/[^a-z0-9-]/gi, '-');
  const statusFile = path.resolve(projectRoot, config.statePath, `${taskId}.state.json`);
  const logsDir = path.resolve(projectRoot, config.logsPath, taskId);
  mkdirSync(logsDir, { recursive: true });

  const status: TaskStatus = readStatus(statusFile);
  updateStatus(statusFile, s => { if (s.taskId === 'unknown') s.taskId = taskId; });

  const taskContent = readFileSync(path.resolve(projectRoot, taskRelativePath), 'utf-8');

  for (const [index, stepConfig] of config.pipeline.entries()) {
    const { name, command, context: contextKeys, check } = stepConfig;

    if (status.steps[name] === 'done') {
      console.log(pc.gray(`[Orchestrator] Skipping '${name}' (already done).`));
      continue;
    }

    const context: Record<string, string> = {};
    for (const key of contextKeys) {
      context[key] = contextProviders[key](projectRoot, taskContent);
    }

    const commandFilePath = path.resolve(projectRoot, '.claude', 'commands', `${command}.md`);
    const commandInstructions = readFileSync(commandFilePath, 'utf-8');
    let fullPrompt = "";
    for (const [title, content] of Object.entries(context)) {
      fullPrompt += `--- ${title.toUpperCase()} ---\n\`\`\`\n${content.trim()}\n\`\`\`\n\n`;
    }
    fullPrompt += `--- YOUR INSTRUCTIONS ---\n${commandInstructions}`;

    const logFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.log`);

    await executeStep(name, command, fullPrompt, statusFile, logFile, check);
  }

  updateStatus(statusFile, s => { s.phase = 'done'; });
  console.log(pc.green("\n[Orchestrator] All steps completed successfully!"));
}
```

### Step 6: Implement the `claude-project validate` Command

**Objective:** Expose the new validation logic as a user-facing command.

**Task:** Modify `src/index.ts` to add the `validate` command.

**File: `src/index.ts` (Updated)**
```typescript
#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { init } from "./init.js";
import { runTask } from "./tools/orchestrator.js";
import { startWebServer } from "./tools/web.js";
import { startTui } from "./tools/tui.js";
import { showStatus } from "./tools/status-cli.js";
import { startWatcher } from "./tools/watch-tasks.js";
import { validatePipeline } from "./tools/validator.js";
import { getConfig, getProjectRoot } from "./config.js";

const program = new Command();
program
  .name("claude-project")
  .description("A CLI tool for orchestrating Claude-based development workflows.")
  .version("0.1.0");

program.command("init") /* ... existing code ... */ ;
program.command("run <taskPath>") /* ... existing code ... */ ;

// Add the new validate command
program
  .command("validate")
  .description("Validates the claude.config.js pipeline.")
  .action(async () => {
    try {
      const config = await getConfig();
      const projectRoot = getProjectRoot();
      const { isValid, errors } = validatePipeline(config, projectRoot);

      if (isValid) {
        console.log(pc.green("✔ Pipeline configuration is valid."));
        console.log(pc.gray(`  › Found ${config.pipeline.length} steps.`));
      } else {
        console.error(pc.red("✖ Pipeline configuration is invalid:\n"));
        for (const error of errors) console.error(pc.yellow(`  - ${error}`));
        process.exit(1);
      }
    } catch (error: any) {
      console.error(pc.red(`Validation error: ${error.message}`));
      process.exit(1);
    }
  });

program.command("web") /* ... existing code ... */ ;
program.command("tui") /* ... existing code ... */ ;
program.command("status") /* ... existing code ... */ ;
program.command("watch") /* ... existing code ... */ ;

program.parseAsync(process.argv);
```

### Step 7: Update the README.md Documentation

**Objective:** Update the documentation to teach users about the new configurable pipeline and the `validate` command.

**Task:** Replace the "How It Works" and "Commands Reference" sections in `README.md`.

**File: `README.md` (Excerpt of Changes)**
```markdown
## How It Works

### The Configurable Pipeline (`claude.config.js`)

This tool is driven by a `pipeline` array in your `claude.config.js` file. You have full control to reorder, remove, or even add new steps to this pipeline. Each step is an object with four key properties:

-   `name`: A unique identifier for the step.
-   `command`: The name of the corresponding `.md` file in `.claude/commands/`.
-   `context`: An array of data "providers" to build the prompt for the AI.
-   `check`: A validation object to confirm the step was successful.

**Example Check Configuration:**
```javascript
// Check that a file was created
check: { type: "fileExists", path: "PLAN.md" }

// Check that a command runs and exits successfully
check: { type: "shell", command: "npm test", expect: "pass" }

// Check that a command runs and fails (e.g., for initial tests)
check: { type: "shell", command: "npm test", expect: "fail" }
```

## Commands Reference

### CLI Commands

-   `claude-project init`: Scaffolds the workflow in the current repository.
-   `claude-project run <path>`: Runs the full workflow for a specific task.
-   `claude-project validate`: **(New)** Checks your `claude.config.js` for errors. Run this after customizing your pipeline.
-   `claude-project watch`: Watches the tasks directory for new files.
-   `claude-project status`: Displays the status of the most recent task.
-   `claude-project tui`: Launches a terminal UI to monitor task progress.
-   `claude-project web`: Starts a minimal web server to view task status.
