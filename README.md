
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
This command sets up everything you need: it creates a `claude.config.js` file, scaffolds default command prompts in a `.claude` directory, adds a sample task, and updates your `package.json` with `claude:*` helper scripts and recommended dependencies.
```bash
claude-project init
```

3.  **Install dependencies:**
The `init` command recommends development dependencies (like `vitest` and `prettier`) by adding them to your `package.json`. Run `npm install` to add them to your project.
```bash
npm install
```

4.  **Run the automated workflow:**
Use the npm script to execute the sample task.
```bash
npm run claude:run -- claude-Tasks/task-001-sample.md
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

2.  **Run the "Safe Clean" Command:** Navigate to your test app directory and run this command. It removes all artifacts from the last run **without deleting your custom commands or pipeline configuration**.
```bash
# In your my-test-app directory
rm -f PLAN.md && rm -rf .claude/state/ .claude/logs/ && git clean -fd src/ test/
```


3.  **Run the Task:** You can now immediately run a fresh test. There is no need to re-initialize or reinstall dependencies.
```bash
# In your my-test-app directory
npm run claude:run -- claude-Tasks/task-001-sample.md
```

4. **Removing old test repo and creating fresh one** 

If you want to start over with a fresh test environment, you can delete the `my-test-app` directory and repeat the initial setup steps.

```bash
# --- 1. Tear Down the Old Environment ---
echo "Removing old test environment..."
rm -rf my-test-app

# --- 2. Create the New Project Shell ---
echo "Creating a fresh test environment..."
mkdir my-test-app
cd my-test-app
npm init -y > /dev/null
git init > /dev/null
git commit --allow-empty -m "Initial commit" > /dev/null

# --- 3. Link and Initialize Your Tool ---
echo "Linking to local claude-project and initializing..."
npm link @your-scope/claude-project
claude-project init
npm install

echo "\n✅ Fresh test environment is ready!"
```

## How It Works

### Configurable Pipelines (`claude.config.js`)

This tool is driven by a `pipelines` object in your `claude.config.js` file. You can define multiple workflows for different kinds of tasks. Each pipeline is an array of steps, and each step is an object with these key properties:

-   `name`: A unique identifier for the step.
-   `command`: The name of the corresponding `.md` file in `.claude/commands/`.
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
   * If true (default), the tool automatically creates a dedicated Git branch
   * for each task. Set to false to run the tool on your current branch.
   */
  manageGitBranch: true,

  /**
   * The default pipeline to use when none is specified.
   */
  defaultPipeline: "default",

  /**
   * Define multiple named pipelines for different workflows.
   * The orchestrator will execute the selected pipeline's steps in order.
   */
  pipelines: {
    default: [
      {
        name: "plan",
        command: "plan-task",
        check: { type: "fileExists", path: "PLAN.md" },
        fileAccess: {
          allowWrite: ["PLAN.md"]
        }
      },
      {
        name: "write_tests",
        command: "write-tests",
        check: { type: "shell", command: "npm test", expect: "fail" },
        fileAccess: {
          allowWrite: ["test/**/*", "tests/**/*"]
        }
      },
      {
        name: "implement",
        command: "implement",
        check: { type: "shell", command: "npm test", expect: "pass" },
        fileAccess: {
          allowWrite: ["src/**/*"]
        }
      },
      {
        name: "docs",
        command: "docs-update",
        check: { type: "none" },
        fileAccess: {
          allowWrite: ["README.md", "docs/**/*", "*.md"]
        }
      },
      {
        name: "review",
        command: "self-review",
        check: { type: "none" },
        // No fileAccess restriction for review step - allows any necessary fixes
      },
    ],
    "docs-only": [
      {
        name: "docs",
        command: "docs-update",
        check: { type: "none" },
        fileAccess: {
          allowWrite: ["README.md", "docs/**/*", "*.md"]
        }
      }
    ]
  },
};
```

**Pipeline Selection:**

The orchestrator selects a pipeline to run based on the following priority order:

1. **CLI Flag:** Use the `--pipeline <name>` option when running a task:
```bash
# Direct command
claude-project run claude-Tasks/my-task.md --pipeline docs-only

# Via npm script (note the -- to pass arguments through)
npm run claude:run -- claude-Tasks/my-task.md --pipeline docs-only
```

2. **Task Frontmatter:** Add a `pipeline` key to your task's YAML frontmatter:
```markdown
---
pipeline: docs-only
---
# My Documentation Task

Update the API documentation to reflect recent changes.
```

3. **Configuration Default:** The `defaultPipeline` property in your `claude.config.js`:
```javascript
module.exports = {
  defaultPipeline: "default",
  pipelines: {
    default: [...],
    "docs-only": [...]
  }
};
```

4. **First Available:** If no default is specified, the first pipeline defined in the `pipelines` object is used.

**Automatic Context Assembly:**
The orchestrator automatically assembles the necessary context for each step, ensuring the AI always has the information it needs to complete its task. This includes the overall pipeline structure, the current step's role, and relevant content such as the task definition and any generated plans. No manual configuration of context providers is required.

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

**Important:** When using `shell` checks with npm commands, the referenced script must exist in your `package.json`. For example, `"npm test"` requires a `"test"` script. The validator will check this and provide clear error messages if scripts are missing.

### Customizable Guardrails (`fileAccess`)

The `fileAccess` property allows you to control which files Claude can modify during each step of your pipeline. This provides fine-grained control over the development workflow and prevents accidental modifications to unintended files.

**Basic Usage:**
Add the `fileAccess` property to any pipeline step:

```javascript
{
  name: "implement",
  command: "implement",
  check: { type: "shell", command: "npm test", expect: "pass" },
  fileAccess: {
    allowWrite: ["src/**/*", "lib/**/*"]
  }
}
```

**Key Features:**
- **Glob Pattern Matching**: Uses standard glob patterns for flexible file matching (e.g., `src/**/*`, `*.md`, `test/**/*.spec.ts`)
- **Step-Specific Control**: Each pipeline step can have different file access rules
- **Optional Enforcement**: Omitting the `fileAccess` property allows unrestricted file access for that step
- **Clear Error Messages**: When a file write is blocked, you'll receive a clear message indicating which patterns are allowed

**Common Examples:**
```javascript
// Allow only test file modifications
fileAccess: {
  allowWrite: ["test/**/*", "tests/**/*", "**/*.test.ts", "**/*.spec.ts"]
}

// Allow source code changes
fileAccess: {
  allowWrite: ["src/**/*", "lib/**/*"]
}

// Allow documentation updates
fileAccess: {
  allowWrite: ["README.md", "docs/**/*", "*.md"]
}

// No restrictions (same as omitting fileAccess entirely)
// fileAccess: { allowWrite: ["**/*"] }
```

**Error Handling:**
When Claude attempts to modify a file that doesn't match the allowed patterns, the operation is blocked with a message like:
```
Blocked: The current step 'implement' only allows file modifications matching ["src/**/*"]. Action on 'README.md' denied.
```

This feature ensures that each step of your pipeline only modifies the files it should, providing confidence in your automated workflow.

### Advanced: Step Hooks and Self-Correction

Traditional CI/CD pipelines are rigid—when a step fails, the entire process halts and requires manual intervention. The `hooks` feature transforms your pipeline into a resilient, self-healing workflow. When a check fails, hooks can automatically provide feedback to Claude, giving it a chance to analyze the error and fix its own work.

**The Problem:** Without hooks, if your `implement` step's tests fail, the pipeline stops. You must manually examine the test output, understand what went wrong, and guide Claude to fix it.

**The Solution:** With `onCheckFailure` hooks, the orchestrator automatically captures the error output and feeds it back to Claude with a tailored prompt, allowing it to self-correct and retry—up to 3 attempts.

#### Basic Configuration

Add a `onCheckFailure` `hooks` object to any pipeline step, which triggers when the step's `check` validation fails:

```javascript
{
  name: "implement",
  command: "implement",
  check: { type: "shell", command: "npm test", expect: "pass" },
  fileAccess: {
    allowWrite: ["src/**/*"]
  },
  hooks: {
    onCheckFailure: [
      {
        type: "shell",
        command: "echo 'The test suite failed. The errors are provided below. Please analyze the output, fix the code in the src/ directory, and ensure all tests pass. Do not modify the test files themselves.\\n\\n---\\n\\n{check_output}'"
      }
    ]
  }
}
```

#### How It Works

1. **Normal Execution**: Claude runs the `implement` command and modifies files in `src/`
2. **Check Validation**: The orchestrator runs `npm test` to validate the implementation
3. **On Failure**: If tests fail, instead of halting:
   - The hook command executes, generating a feedback prompt
   - `{check_output}` is replaced with the actual test failure output
   - Claude receives this feedback and attempts to fix the issues
   - The cycle repeats up to 3 times until tests pass or retries are exhausted

#### Key Features

- **Automatic Retry**: Failed steps automatically retry with context-aware feedback
- **Error Context**: The `{check_output}` token passes actual error output to Claude
- **Retry Limits**: Steps retry up to 3 times before failing permanently
- **Hook Types**: 
  - `onCheckFailure`: Triggers when the step's check validation fails

#### Common Use Cases

**Test Failures During Implementation:**
```javascript
hooks: {
  onCheckFailure: [
    {
      type: "shell", 
      command: "echo 'Tests failed. Fix the implementation based on these errors:\\n{check_output}'"
    }
  ]
}
```

**Build or Lint Errors:**
```javascript
hooks: {
  onCheckFailure: [
    {
      type: "shell",
      command: "echo 'Build failed. Please fix these compilation errors and ensure the code builds successfully:\\n{check_output}'"
    }
  ]
}
```


#### Error Handling

- **Hook Command Failures**: If a hook command itself fails, the step fails immediately with a clear error message
- **Retry Exhaustion**: After 3 failed attempts, the step fails permanently
- **Missing Token**: If `{check_output}` is omitted from the hook command, it still works but without error context

This self-correction capability makes your pipelines more autonomous and reduces the need for manual intervention during development workflows.

### Debugging and Logs

The orchestrator provides comprehensive logging to help you understand both what happened and why. For each pipeline step, two log files are created in the `.claude/logs/` directory:

- **`XX-step-name.log`**: Contains the final, clean output from the AI tool. This is the polished result you would normally see.
- **`XX-step-name.reasoning.log`**: Contains the AI's detailed reasoning process. This shows the step-by-step thinking that led to the final output.

**When to use each log:**
- Use the standard `.log` file to see what the AI produced and any errors that occurred.
- Use the `.reasoning.log` file to understand *why* the AI made specific decisions, especially when debugging unexpected outputs or behaviors.

The reasoning logs are particularly valuable when:
- A step produces unexpected results
- You want to understand the AI's decision-making process
- You're fine-tuning your prompts or pipeline configuration
- You need to troubleshoot complex implementation choices

### Isolated and Resumable Git Branches

By default (`manageGitBranch: true`), the orchestrator automatically manages Git branches for you. When you run a task:

1.  It first checks that your repository has no uncommitted changes.
2.  It switches to your local `main` branch. If you have a remote repository named `origin`, it attempts to pull the latest changes to ensure you're up to date. (If you have a local-only repository, it safely skips this step).
3.  It then creates a unique, dedicated branch for the task (e.g., `claude/my-new-feature`).
4.  All commits generated by the AI during the pipeline are made to this task branch.

This keeps your `main` branch clean and isolates all automated work, whether you are working locally or with a remote team.

**Alternative Mode:** If you set `manageGitBranch: false` in your config, the tool will skip all branch management and run directly on your current branch. This is useful for advanced workflows where you want full control over Git operations, but you'll see a warning that the tool is operating on your current branch.

### Permissions and Security (`.claude/settings.json`)

For the orchestrator to run non-interactively, it needs permission to execute `Bash` commands like `npm test` and `git commit`. The `claude-project init` command scaffolds a `.claude/settings.json` file with a safe set of default permissions to enable this.

This file pre-approves `Bash` commands that are essential for the default workflow (scoped to `npm`, `git`, and `vitest`) while denying network access. **Important:** If you have an existing `.claude/settings.json` file, the `init` command **will not overwrite it**. Instead, it will check if the necessary validation hooks are present. If they are missing, it will prompt you to add them, ensuring that security features like `fileAccess` work correctly while preserving your custom settings.

Managing these permissions is simple, even when you customize your pipeline. The **`claude-project validate`** command acts as a safety net and a helper. It validates two things:

1. **Permissions**: When you add a step that requires a `Bash` permission not in your `settings.json`, the validator detects it and offers to add it
2. **Package.json Scripts**: When your pipeline references npm scripts (e.g., `npm test`), the validator ensures those scripts exist in your `package.json`

For example, if you add a `lint` step that needs to run `npm run lint:fix`, but don't have a `lint:fix` script, the validator will show:

> ```
> ✖ Pipeline configuration is invalid:
> 
>   - Step 4 ('lint'): The command "npm run lint:fix" requires a script named "lint:fix" in your package.json, but it was not found.
>   - Step 4 ('lint'): Requires missing permission "Bash(npm run lint:fix)"
> 
> This command can automatically add the missing permissions for you.
> Would you like to add these permissions to .claude/settings.json? (y/N)
> ```

The validator ensures both your security settings and project configuration stay in sync with your workflow.

## Commands Reference

### CLI Commands

All commands are available directly via the `claude-project` executable.

-   `claude-project init`: Scaffolds the workflow in the current repository.
-   `claude-project run <path-to-task.md>`: Runs the full workflow for a specific task.
    -   `--pipeline <name>`: Specifies which pipeline to use, overriding config and task defaults.
-   `claude-project validate`: Validates your `claude.config.js` pipeline configuration.
-   `claude-project watch`: Watches the tasks directory and runs new tasks automatically.
-   `claude-project status`: Displays the status of the most recent task as JSON.
-   `claude-project tui`: Launches an interactive terminal UI to monitor task progress.
-   `claude-project web`: Starts a minimal web server to view task status.

### NPM Scripts

The `init` command adds these `claude:*` scripts to your project's `package.json`:

-   `npm run claude:run -- <path>`: The recommended way to run a task. Use `--` to pass additional flags like `--pipeline <name>`.
-   `npm run claude:watch`: Watches for new tasks.
-   `npm run claude:status`: Shows the latest task status.
-   `npm run claude:tui`: Launches the terminal UI.
-   `npm run claude:web`: Starts the status web server.

**Note:** Test scripts (like `npm test`) are not automatically added. The default pipeline includes test steps that assume you have `test`, `test:watch`, and `coverage` scripts, but you can customize your pipeline to use any testing framework or remove testing steps entirely.

## System Requirements

-   **Node.js**: Version 18.0 or higher.
-   **Git**: Must be installed and configured.
-   **Claude CLI**: The `claude` command-line tool must be installed and authenticated on your system.
-   **Package.json Scripts**: Any npm scripts referenced in your pipeline's shell commands must be defined in your `package.json`.
