
***

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
    This command is the only setup you need. It creates a `claude.config.js` file, a sample task, and adds the required scripts to your `package.json`.
    ```bash
    claude-project init
    ```

3.  **Install the added dev dependency:**
    The `init` command adds `@your-scope/claude-project` to your `devDependencies` to lock in the version for your project.
    ```bash
    npm install
    ```

4.  **Run the automated workflow:**
    Use the npm script to execute the sample task.
    ```bash
    npm run claude:run claude-Tasks/task-001-sample.md
    ```

The orchestrator will now take over, running each step of the pipeline and committing its progress along the way.

## How to Test Locally (For Developers)

When you are actively developing the `claude-project` tool itself, you need a way to test your local changes without publishing to npm. The `npm link` command is perfect for this.

This process involves two main steps:
1.  Create a global link to your local `claude-project` source code.
2.  Create a separate, clean test project and link it to your global `claude-project`.

Here is the complete workflow:

**Step 1: In your `claude-project` directory**

First, build your project to ensure the `dist` directory is up to date. Then, run `npm link` to register your local version as a global package on your machine.

```bash
# In your claude-project repository root
npm run build
npm link
```
Your computer now knows that any call to `claude-project` should use your local source code.

**Step 2: Set up a separate test environment**

Create a brand new directory to simulate a user's project. This keeps your development environment clean.

```bash
# Navigate out of your project directory
cd ..

# Remove any old test app to start fresh
rm -rf my-test-app

# Create and set up a new test app
mkdir my-test-app
cd my-test-app
npm init -y
git init
echo "# My Test App" > README.md
git add .
git commit -m "Initial commit"
# open vscode
code .
```

**Step 3: Link the test environment to your local tool**

Inside the new `my-test-app` directory, run `npm link @your-scope/claude-project`. This tells the test project to use the globally linked version of your tool, which points directly to your local source code.

```bash
# Inside the my-test-app directory
npm link @your-scope/claude-project
```

**Step 4: Run the init command**

You can now use the `claude-project` command as if it were globally installed. Run the `init` command to set up the configuration in your test project.

```bash
# Inside my-test-app
claude-project init
npm install
```

Now you are ready to test! Any changes you make to the source code in your `claude-project` directory will be reflected immediately when you run commands like `claude-project run` or `npm run claude:run` inside `my-test-app`. Just remember to run `npm run build` in your `claude-project` directory after you make changes.

## How It Works

### Configuration (`claude.config.js`)

All configuration is managed in a single `claude.config.js` file at the root of your project. This file allows you to customize where tasks, logs, and state files are stored.

```javascript
// claude.config.js

/** @type {import('@your-scope/claude-project').ClaudeProjectConfig} */
export default {
  /**
   * The folder where your task markdown files are stored.
   */
  taskFolder: "claude-Tasks",

  /**
   * The directory to store state files for running tasks.
   */
  statePath: ".claude/state",

  /**
   * The directory to store detailed logs for each step of a task.
   */
  logsPath: ".claude/logs",

  /**
   * An array of glob patterns to ignore when gathering project structure.
   */
  structureIgnore: [
    "node_modules/**",
    ".git/**",
    "dist/**",
    ".claude/**",
    "*.lock",
  ],
};
```

### The Six-Step Workflow

Each task is executed through a consistent and reliable pipeline:

1.  **Plan:** Generates a detailed implementation plan (`PLAN.md`).
2.  **Write Tests:** Creates failing tests based on the plan.
3.  **Implement:** Writes the source code to make the tests pass.
4.  **Update Docs:** Updates the `README.md` and other documentation.
5.  **Self Review:** Refactors code for style and clarity without changing behavior.
6.  **Commit:** Each step creates a git commit, providing a checkpoint to resume from.

## Commands Reference

### CLI Commands

-   `claude-project init`: Scaffolds the workflow in the current repository.
-   `claude-project run <path-to-task.md>`: Runs the full workflow for a specific task.
-   `claude-project watch`: (Future implementation) Watches the task folder for new files.
-   `claude-project status`: (Future implementation) Shows the status of running tasks.

### NPM Scripts

The `init` command adds these helpful scripts to your `package.json`:

-   `npm run claude:run <path-to-task.md>`: The recommended way to run a task.
-   `npm run claude:tui`: Launches a terminal UI to monitor task progress.
-   `npm run claude:web`: Starts a minimal web server to view status.

## System Requirements

-   **Node.js**: Version 18.0 or higher.
-   **Git**: Must be installed and configured.
-   **Claude CLI**: The `claude` command-line tool must be installed and authenticated on your system.
-   **GitHub CLI**: The `gh` command is required if you wish to implement and use a PR-creation step.