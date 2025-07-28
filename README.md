
# Claude Project

A command-line tool that orchestrates a structured, step-gated development workflow in your repository using Claude.

`claude-project` transforms your development process into a systematic and automated pipeline. By installing this single tool, you can run tasks through a controlled, multi-step process that includes planning, test generation, implementation, documentation updates, and code review, all with automated checkpoints and git commits.

## Installation

Install the CLI globally using npm. This makes the `claude-project` command available anywhere on your system.

```bash
npm install -g @your-scope/claude-project
```

## Quick Start

Follow these steps to integrate the Claude workflow into your existing TypeScript project.

1.  **Navigate to your project's root directory:**

```bash
cd your-typescript-project
```

2.  **Initialize the project:**
This command sets up everything you need: it creates a `claude.config.js` file, scaffolds default command prompts in a `.claude` directory, adds a sample task, and updates your `package.json` with necessary scripts and dependencies.
```bash
claude-project init
```

3.  **Install dependencies:**
The `init` command adds several development dependencies (like `vitest` and `prettier`) to your `package.json`. Run `npm install` to add them to your project.
```bash
npm install
```

4.  **Run the automated workflow:**
Use the npm script to execute the sample task.
```bash
npm run claude:run claude-Tasks/task-001-sample.md
```

The orchestrator will now take over, running each step of the pipeline and committing its progress along the way.

## How to Test Locally (for Developers)

When developing the `claude-project` tool itself, you need a way to test your local changes without publishing to npm. This is done using `npm link`.

### Part 1: Initial One-Time Setup

First, set up your `claude-project` tool and create a dedicated test environment.

1.  **Globally Link Your Tool:** In the root directory of your `claude-project` source code, run these commands. This builds your tool and creates a global symlink to it that your system can use.
```bash
# In your claude-project repository root
npm run build
npm link
```

2.  **Create a Test Environment:** Set up a separate, clean project to test in.
```bash
# From a parent directory (e.g., cd ..)
rm -rf my-test-app
mkdir my-test-app
cd my-test-app
npm init -y
git init
git commit --allow-empty -m "Initial commit"
```

3.  **Initialize and Install in the Test App:** Now, from inside `my-test-app`, run the setup process. The order is important.
```bash
# Inside the my-test-app directory

# Run your tool's init command
claude-project init

# Link the dependency to your local source
npm link @your-scope/claude-project

# Install other dependencies like vitest and prettier
npm install
```
Your test environment is now ready.

### Part 2: The Re-Testing Workflow (Every Time You Change Code)

This is the loop you will follow every time you make changes to `claude-project` and want to test them.

1.  **Rebuild Your Tool:** After saving changes in your `claude-project` source code, you must rebuild it.
```bash
# In your claude-project repository root
npm run build
```

2.  **Clean Your Test Environment:** Navigate to your test app directory and run the master clean-up command. This completely resets it, removing all artifacts from the previous run.
```bash
# In your my-test-app directory
rm -f claude.config.js PLAN.md && rm -rf .claude/ claude-Tasks/ node_modules/ package-lock.json && git clean -fdx
```

3.  **Re-Initialize, Link, and Install:** Run the same setup commands as in the initial setup.
```bash
# Inside the my-test-app directory
claude-project init
npm link @your-scope/claude-project
npm install
```
Now you are ready to run a fresh test with your latest changes: `npm run claude:run claude-Tasks/task-001-sample.md`.

## How It Works

### The Configurable Pipeline (`claude.config.js`)

This tool is driven by a `pipeline` array in your `claude.config.js` file. You have full control to reorder, remove, or even add new steps to this pipeline. Each step is an object with four key properties:

-   `name`: A unique identifier for the step.
-   `command`: The name of the corresponding `.md` file in `.claude/commands/`.
-   `context`: An array of data "providers" to build the prompt for the AI.
-   `check`: A validation object to confirm the step was successful.

```javascript
// claude.config.js
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
      check: { type: "fileExists", path: "PLAN.md" },
    },
    {
      name: "write_tests",
      command: "write-tests",
      context: ["planContent", "taskDefinition"],
      check: { type: "shell", command: "npm test", expect: "fail" },
    },
    {
      name: "implement",
      command: "implement",
      context: ["planContent"],
      check: { type: "shell", command: "npm test", expect: "pass" },
    },
    {
      name: "docs",
      command: "docs-update",
      context: ["planContent", "projectStructure"],
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

**Available Context Providers:**
- `projectStructure`: A list of all files in your project
- `taskDefinition`: The content of the task markdown file
- `planContent`: The content of the generated PLAN.md file

**Check Types:**
```javascript
// Check that a file was created
check: { type: "fileExists", path: "PLAN.md" }

// Check that a command runs and exits successfully
check: { type: "shell", command: "npm test", expect: "pass" }

// Check that a command runs and fails (e.g., for initial tests)
check: { type: "shell", command: "npm test", expect: "fail" }

// No automated validation
check: { type: "none" }
```

### Permissions and Security (`.claude/settings.json`)

For the orchestrator to run non-interactively, it needs permission to execute `Bash` commands like `npm test` and `git commit`. The `claude-project init` command scaffolds a `.claude/settings.json` file with a safe set of default permissions to enable this.

This file pre-approves `Bash` commands that are essential for the default workflow (scoped to `npm`, `git`, and `vitest`) while denying network access. **Important:** If you have an existing `.claude/settings.json` file, the `init` command **will not overwrite it**, preserving your custom configuration.

Managing these permissions is simple, even when you customize your pipeline. The **`claude-project validate`** command acts as a safety net and a helper. When you add a new step or command that requires a `Bash` permission not listed in your `settings.json`, the validator will detect it and offer to fix it for you.

For example, if you add a `lint` step that needs to run `npm run lint:fix`, the validator will show you:

> ```
> ✖ Pipeline configuration is invalid:
> 
>   - Step 4 ('lint'): Requires missing permission "Bash(npm run lint:fix)"
> 
> This command can automatically add the missing permissions for you.
> Would you like to add these permissions to .claude/settings.json? (y/N)
> ```

If you press `y` and hit Enter, the tool will safely and automatically add the required permission to your `settings.json` file. This turns the validator into a powerful assistant, ensuring your security settings always stay in sync with your workflow.

## Commands Reference

### CLI Commands

All commands are available directly via the `claude-project` executable.

-   `claude-project init`: Scaffolds the workflow in the current repository.
-   `claude-project run <path-to-task.md>`: Runs the full workflow for a specific task.
-   `claude-project validate`: Validates your `claude.config.js` pipeline configuration.
-   `claude-project watch`: Watches the tasks directory and runs new tasks automatically.
-   `claude-project status`: Displays the status of the most recent task as JSON.
-   `claude-project tui`: Launches an interactive terminal UI to monitor task progress.
-   `claude-project web`: Starts a minimal web server to view task status.

### NPM Scripts

The `init` command adds these helpful scripts to your project's `package.json`:

-   `npm run claude:run <path>`: The recommended way to run a task.
-   `npm run claude:watch`: Watches for new tasks.
-   `npm run claude:status`: Shows the latest task status.
-   `npm run claude:tui`: Launches the terminal UI.
-   `npm run claude:web`: Starts the status web server.
-   `npm test`: Runs the test suite once.
-   `npm run test:watch`: Runs tests in interactive watch mode.
-   `npm run coverage`: Runs tests and generates a coverage report.

## System Requirements

-   **Node.js**: Version 18.0 or higher.
-   **Git**: Must be installed and configured.
-   **Claude CLI**: The `claude` command-line tool must be installed and authenticated on your system.
