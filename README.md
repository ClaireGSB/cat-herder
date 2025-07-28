
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

### Configuration (`claude.config.js`)

All configuration is managed in a single `claude.config.js` file at the root of your project. This file uses the CommonJS `module.exports` syntax for maximum compatibility.

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
};
```

### The Workflow Pipeline

Each task is executed through a consistent and reliable series of steps:

1.  **Plan:** Generates a detailed implementation plan (`PLAN.md`).
2.  **Write Tests:** Creates failing tests based on the plan.
3.  **Implement:** Writes the source code to make the tests pass.
4.  **Update Docs:** Updates `README.md` and other documentation.
5.  **Self Review:** Refactors code for style and clarity without changing behavior.
6.  **Commit:** Each step creates a git commit, providing a fault-tolerant checkpoint.

## Commands Reference

### CLI Commands

All commands are available directly via the `claude-project` executable.

-   `claude-project init`: Scaffolds the workflow in the current repository.
-   `claude-project run <path-to-task.md>`: Runs the full workflow for a specific task.
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
