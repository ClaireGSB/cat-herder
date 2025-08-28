
# cat-herder



A command-line tool that orchestrates a structured, step-gated development workflow in your repository using AI.

`cat-herder` transforms your development process into a systematic and automated pipeline. By installing this single tool, you can run tasks through a controlled, multi-step process that includes planning, test generation, implementation, documentation updates, and code review, all with automated checkpoints and git commits.

## Table of Contents
* [Overview](#overview)
* [Quick Start](#quick-start)
  * [Installation](#installation)
  * [Initialize and Run Your First Task](#initialize-and-run-your-first-task)
* [Running Task Sequences](#running-task-sequences)
  * [Usage (Sequences)](#usage-sequences)
* [Local Development & Testing (for Contributors)](#local-development--testing-for-contributors)
  * [Part 1: Initial One-Time Setup (`npm link`)](#part-1-initial-one-time-setup-npm-link)
  * [Part 2: The Re-Testing Workflow (Every Time You Change Code)](#part-2-the-re-testing-workflow-every-time-you-change-code)
  * [Part 3: Testing the Web Dashboard](#part-3-testing-the-web-dashboard)
* [Interactive Halting (Interaction Threshold)](#interactive-halting-interaction-threshold)
  * [The Interaction Threshold Scale](#the-interaction-threshold-scale)
  * [Configuration](#configuration)
    * [Global Configuration (`cat-herder.config.js`)](#global-configuration-cat-herderconfigjs)
    * [Task-Level Override (Frontmatter)](#task-level-override-frontmatter)
  * [How to Enable and Use Interactive Halting](#how-to-enable-and-use-interactive-halting)
* [Advanced Configuration & Features](#advanced-configuration--features)
  * [Understanding Task Sequences (Detailed)](#understanding-task-sequences-detailed)
    * [The Dynamic Workflow Advantage](#the-dynamic-workflow-advantage)
    * [How It Works (Sequences)](#how-it-works-sequences)
    * [Task Ordering and Naming](#task-ordering-and-naming)
    * [Ignoring Files for Comments and Planning](#ignoring-files-for-comments-and-planning)
    * [Example: Dynamic Task Generation from a PRD](#example-dynamic-task-generation-from-a-prd)
  * [Configurable Pipelines (`cat-herder.config.js`)](#configurable-pipelines-cat-herderconfigjs)
    * [Per-Step Model Selection](#per-step-model-selection)
    * [Pipeline Selection](#pipeline-selection)
    * [Automatic Context Assembly](#automatic-context-assembly)
    * [Check Types](#check-types)
    * [Multiple Checks (Sequential Validation)](#multiple-checks-sequential-validation)
    * [Important Note on Shell Checks](#important-note-on-shell-checks)
  * [Customizable Guardrails (`fileAccess`)](#customizable-guardrails-fileaccess)
    * [Basic Usage](#basic-usage)
    * [Key Features](#key-features)
    * [Common Examples](#common-examples)
    * [Error Handling (Guardrails)](#error-handling-guardrails)
  * [Automatic Retries on Failure](#automatic-retries-on-failure)
    * [Basic Configuration](#basic-configuration)
    * [How Retries Work with Multiple Checks](#how-retries-work-with-multiple-checks)
    * [How It Works (Retries)](#how-it-works-retries)
    * [Key Features (Retries)](#key-features-retries)
    * [Common Use Cases (Retries)](#common-use-cases-retries)
    * [Error Handling (Retries)](#error-handling-retries)
  * [Handling API Rate Limits](#handling-api-rate-limits)
    * [Graceful Failure (Default)](#graceful-failure-default)
    * [Automatic Wait & Resume (Opt-in)](#automatic-wait--resume-opt-in)
  * [Debugging and Logs](#debugging-and-logs)
    * [When to use each log](#when-to-use-each-log)
  * [State Files](#state-files)
    * [Task State File (`<task-id>.state.json`)](#task-state-file-task-idstatejson)
    * [Sequence State File (`<sequence-id>.state.json`)](#sequence-state-file-sequence-idstatejson)
  * [Cost and Usage Monitoring](#cost-and-usage-monitoring)
    * [Token Usage in Log Files](#token-usage-in-log-files)
    * [Token Usage in State Files](#token-usage-in-state-files)
    * [Understanding Token Types](#understanding-token-types)
  * [Isolated and Resumable Git Branches](#isolated-and-resumable-git-branches)
    * [Alternative Mode](#alternative-mode)
  * [Enabling Auto-Commits](#enabling-auto-commits)
    * [Adding Commit Instructions to Command Prompts](#adding-commit-instructions-to-command-prompts)
  * [Permissions and Security (`.claude/settings.json`)](#permissions-and-security-claudesettingsjson)
* [Interactive Web Dashboard](#interactive-web-dashboard)
  * [Getting Started](#getting-started)
* [Commands Reference](#commands-reference)
  * [CLI Commands](#cli-commands)
  * [NPM Scripts](#npm-scripts)
* [System Requirements](#system-requirements)

---

## Overview

`cat-herder` is a powerful CLI tool designed to bring structure and automation to your development process using AI. It enables you to define complex workflows and execute them autonomously, with built-in mechanisms for collaboration, validation, and recovery.

### Core Concepts: Sequences, Tasks, and Steps

To effectively use `cat-herder`, it's important to understand its three core hierarchical concepts:

*   **Sequence**: An overarching project or a large feature that requires multiple, ordered tasks. It's a container for related tasks, allowing for dynamic task generation and execution on a single Git branch.
*   **Task**: A single, self-contained goal or sub-feature within a sequence (or as a standalone unit). It's defined in a Markdown file (e.g., `01-feature-x.md`) and specifies *what* needs to be done.
*   **Step**: An individual, distinct action within a larger workflow (a pipeline). A task is broken down into a series of steps (e.g., `plan`, `write_tests`, `implement`, `review`). Each step has its own specific instructions and validation checks defined in your `cat-herder.config.js`.

**Conceptual Flow:**


/your-project-root
├── cat-herder.config.js             # Defines pipelines (ordered lists of steps)
└── cat-herder-tasks/                # Main directory for all tasks and sequences
    ├── update-readme.md             # Standalone Task (e.g., "Update Readme")
    │   └── Uses Pipeline 'docs-only'
    │       ├── Step 1: Docs Update
    │       └── ...
    │
    ├── fix-bug-critical.md          # Standalone Task (e.g., "Fix Critical Bug")
    │   └── Uses Pipeline 'default'
    │       ├── Step 1: Plan
    │       ├── Step 2: Implement
    │       └── ... (any additional steps you have defined in this pipeline)
    │
    ├── my-feature-sequence/         # Sequence Folder (Tasks pre-created)
    │   ├── _NOTES.md                # Context file (will not be interpreted as a task due to the underscore.)
    │   │
    │   ├── 01-initial-feature-plan.md     # Task 1
    │   │   └── Uses Pipeline 'TDD'
    │   │       ├── Step 1: Plan
    │   │       ├── Step 2: Write Tests
    │   │       └── ...
    │   │
    │   ├── 02-implement-api.md            # Task 2
    │   │   └── Uses Pipeline 'default'
    │   │       ├── Step 1: Plan
    │   │       ├── Step 2: Implement
    │   │       └── ...
    │   │
    │   └── 03-update-documentation.md     # Task 3
    │       └── Uses Pipeline 'docs-only'
    │           ├── Step 1: Docs Update
    │           └── ...
    │
    └── new-feature-dynamic-build/   # Sequence Folder (Tasks created dynamically by AI)
        ├── _INITIAL_REQUIREMENTS.md # Context file (will not be interpreted as a task due to the underscore.)
        │
        └── 01-break-down-feature.md # Initial Task for dynamic generation (the task is for the AI to read _INITIAL_REQUIREMENTS.md and create subsequent tasks)
            └── Uses Pipeline 'create-tasks'
                ├── Step 1: Analyze & Generate Tasks
                └── (This step will dynamically create subsequent tasks like:)
                    ├── 02-design-module.md
                    │   └── Uses Pipeline 'default' (...)
                    ├── 03-implement-service.md
                    │   └── Uses Pipeline 'default' (...)
                    └── (and so on...)

### Key Capabilities and Workflows

*   **Automated Development Pipelines**: Define multi-step workflows (pipelines) in `cat-herder.config.js` to systematically guide the AI through stages like planning, coding, testing, and documentation.
*   **Dynamic Task Sequences**: Orchestrate a series of related tasks from a folder, where early tasks can dynamically create subsequent tasks for a fully autonomous feature implementation.
*   **Interactive Human Collaboration**: Set an "Interaction Threshold" to allow the AI to pause and ask for human clarification, balancing automation with oversight.
*   **Robust Error Handling**: Automatic retries for failed steps and graceful handling of API rate limits ensure your workflows are resilient.
*   **Comprehensive Logging & Monitoring**: Detailed logs, state files, and a real-time web dashboard provide full visibility into the AI's reasoning, progress, and resource usage.
*   **Version Control Integration**: Isolates AI work on dedicated Git branches, automatically committing progress and keeping your `main` branch clean.

---

## Quick Start

`cat-herder` streamlines your development workflow using AI. This section will guide you through getting started with a new or existing TypeScript project.

### Installation

**Important Note: This package (`@your-scope/cat-herder`) is currently under development and is not yet published to npm.**

For now, if you wish to use `cat-herder`, you will need to clone the repository and follow the instructions in the [Local Development & Testing (for Contributors)](#local-development--testing-for-contributors) section to set up `npm link`. Once the package is officially published, you will be able to install it globally with:

```bash
# This command will work once the package is published to npm.
npm install -g @your-scope/cat-herder
```

### Initialize and Run Your First Task

Follow these steps to integrate `cat-herder` into your existing TypeScript project.

1.  **Navigate to your project's root directory:**

    ```bash
    cd your-typescript-project
    ```

2.  **Initialize the project:**
    This command sets up everything you need: it creates a `cat-herder.config.js` file, scaffolds default command prompts in a `.claude` directory, adds a sample task, and updates your `package.json` with `cat-herder:*` helper scripts and recommended dependencies.

    ```bash
    cat-herder init
    ```

3.  **Install dependencies:**
    The `init` command recommends development dependencies (like `vitest` and `prettier`) by adding them to your `package.json`. Run `npm install` to add them to your project.

    ```bash
    npm install
    ```

4.  **Run the automated workflow:**
    Use the npm script to execute the sample task.

    ```bash
    npm run cat-herder:run -- cat-herder-tasks/task-001-sample.md
    ```

    The orchestrator will now take over, running each step of the pipeline and committing its progress along the way.

## Running Task Sequences

For complex features or projects requiring multiple, ordered tasks that might not be known ahead of time, `cat-herder` offers the `run-sequence` command. This feature enables dynamic task creation within a single workflow, allowing an initial task to generate subsequent tasks that are automatically discovered and executed.

### Usage (Sequences)

Execute a sequence of tasks from a folder:

```bash
# Direct command
cat-herder run-sequence cat-herder-tasks/my-feature

# Via npm script  
npm run cat-herder:run-sequence -- cat-herder-tasks/my-feature
```
For a detailed explanation of how sequences work, including dynamic task generation examples, see [Understanding Task Sequences (Detailed)](#understanding-task-sequences-detailed) in the Advanced Configuration & Features section.

## Local Development & Testing (for Contributors)

When contributing to the `cat-herder` tool itself, you need a way to test your local changes without publishing to npm. This is achieved using `npm link`, which creates symbolic links.

### Part 1: Initial One-Time Setup (`npm link`)

First, set up your `cat-herder` tool and create a dedicated test environment.

1.  **Globally Link Your Tool:** In the root directory of your `cat-herder` source code, run these commands. This builds your tool and creates a global symlink to it that your system can use.

    ```bash
    # In your cat-herder repository root (e.g., where this README is located)
    npm run build
    npm link
    ```

2.  **Create a Test Environment:** Set up a separate, clean project to test in. This should be *outside* of your `cat-herder` repository.

    ```bash
    # From a parent directory (e.g., cd .. from cat-herder-repo-root)
    rm -rf my-test-app
    mkdir my-test-app
    cd my-test-app
    npm init -y
    git init
    git commit --allow-empty -m "Initial commit"
    ```

3.  **Initialize and Link in the Test App:** Now, from inside `my-test-app`, run the setup process. The order is important.

    ```bash
    # Inside the my-test-app directory

    # Run your tool's init command (which is globally linked)
    cat-herder init

    # Link the @your-scope/cat-herder dependency in your test app
    # to your local source code.
    npm link @your-scope/cat-herder

    # Install other dependencies like vitest and prettier (recommended by init)
    npm install
    ```
    Your test environment is now ready. The `cat-herder` command within `my-test-app` will now execute your locally linked version.

### Part 2: The Re-Testing Workflow (Every Time You Change Code)

This is the loop you will follow every time you make changes to `cat-herder` and want to test them.

1.  **Rebuild Your Tool:** After saving changes in your `cat-herder` source code, you must rebuild it.

    ```bash
    # In your cat-herder repository root
    npm run build
    ```

2.  **Run the "Safe Clean" Command:** Navigate to your test app directory and run this command. It removes all artifacts from the last run **without deleting your custom commands or pipeline configuration**.

    ```bash
    # In your my-test-app directory
    rm -f PLAN.md && rm -rf .cat-herder/ && git clean -fd src/ test/
    ```

    **Note:** This removes the `.cat-herder/` directory which contains the application's state and log files. Your command prompts in `.claude/commands/` are preserved.

3.  **Run the Task:** You can now immediately run a fresh test. There is no need to re-initialize or reinstall dependencies.

    ```bash
    # In your my-test-app directory
    npm run cat-herder:run -- cat-herder-tasks/task-001-sample.md
    ```

4.  **Removing Old Test Repo and Creating Fresh One**

    If you want to start over with a completely fresh test environment (e.g., after major `cat-herder init` changes), you can delete the `my-test-app` directory and repeat the initial setup steps.

    ```bash
    # From the parent directory of my-test-app (e.g., cd .. from my-test-app)
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
    echo "Linking to local cat-herder and initializing..."
    npm link @your-scope/cat-herder # This uses your globally linked version
    cat-herder init # This uses your globally linked version
    npm install # Installs dependencies for my-test-app

    echo "\n✅ Fresh test environment is ready!"
    ```

### Part 3: Testing the Web Dashboard

To test the web dashboard UI without running a live task, you can use the built-in test environment, which uses a static set of mock data from the `test/e2e-data/` directory.

```bash
# In your cat-herder repository root
npm run test:manual:web
```

This will start the web server on `http://localhost:5177` populated with consistent data, allowing you to safely verify UI changes without needing to run a live AI task or having existing data in your `~/.cat-herder` directory.

## Interactive Halting (Interaction Threshold)

The `cat-herder` tool includes a powerful feature that transforms the AI from a fully autonomous agent into a collaborative partner. By setting an **Interaction Threshold**, you can control when the AI should pause its work to ask for human clarification, balancing speed with safety for different types of tasks.

### The Interaction Threshold Scale

The `interactionThreshold` is configured in your `cat-herder.config.js` or a task's frontmatter as an integer from `0` to `5`. This number determines how cautious the AI will be.

-   **`0` - Fully Autonomous (Default):** The AI will never ask questions. It makes its best assumptions and proceeds without interruption.
-   **`1-2` - Low Interruption:** The AI will only pause if it is completely blocked by a contradiction in the requirements or is about to perform a potentially destructive action (like deleting a file).
-   **`3-4` - Medium Interruption:** The AI will ask for clarification when faced with significant architectural or technical decisions that aren't clearly specified (e.g., "Should I add this to API v1 or create a new v2?").
-   **`5` - High Interruption:** The AI will be very cautious. It will ask to clarify any ambiguity, no matter how small, and may present you with options before proceeding with a complex implementation.

### Configuration

You can set the threshold globally or per-task.

#### Global Configuration (`cat-herder.config.js`)

Set a default threshold for all tasks in your project.

```javascript
// cat-herder.config.js
module.exports = {
  // ... other configuration
  
  // Set the default interaction threshold (0-5)
  interactionThreshold: 0, // Default is 0 for backward compatibility
};```

#### Task-Level Override (Frontmatter)

For specific tasks that require more or less caution, override the global setting in the task's `.md` file.

```markdown
---
pipeline: default
interactionThreshold: 5
---
# Complex Refactoring Task
This task involves major architectural changes. Be cautious and ask questions when uncertain.```

### How to Enable and Use Interactive Halting

1.  **Set the Threshold:** Choose a value greater than `0` in your config or task frontmatter.

2.  **Grant Permission:** For this feature to work, the AI needs permission to use the `cat-herder ask` command. You **must** add the `Bash(cat-herder ask:*)` permission to your `.claude/settings.json` file. The `cat-herder validate` command will detect if this is missing and offer to add it for you.

    ```json
    // .claude/settings.json
    {
      "permissions": {
        "allow": [
          "Bash(npm test:*)",
          "Bash(cat-herder ask:*)"
        ]
      }
    }
    ```

3.  **Run the Task:** When the AI needs to ask a question, it will pause. The specific pipeline step, the task, and if applicable, the parent sequence are all set to a `waiting_for_input` status in the UI, providing consistent status visibility across all workflow levels. You can answer in two ways:
    *   **Via CLI:** The command line will display the question and wait for your typed response.
    *   **Via Web Dashboard:** The dashboard will show an interactive card with the question and a form to submit your answer.

4.  **Resume:** Once an answer is provided from either source, the AI receives the guidance and continues the task. Importantly, the complete history of questions and answers is automatically provided as context to all subsequent steps in the pipeline, ensuring that human guidance is consistently understood and applied throughout the entire development workflow. All interactions are saved and can be reviewed on the task detail page in the web dashboard.

## Advanced Configuration & Features

This section delves into the detailed mechanisms and advanced configurations that power `cat-herder`.

### Understanding Task Sequences (Detailed)

`cat-herder`'s task sequencing capability allows for the orchestration of complex, multi-task workflows, including dynamic task generation.

#### The Dynamic Workflow Advantage

Traditional single-task execution works well for self-contained features, but complex workflows often require multiple coordinated tasks. The sequence orchestrator transforms your development process by:

- **Dynamic Task Discovery**: After completing each task, the orchestrator re-scans the folder for new tasks that may have been created
- **Single Branch Execution**: All tasks in a sequence run on the same Git branch, maintaining workflow continuity
- **Autonomous Multi-Task Workflows**: Initial tasks can generate the rest of the workflow, creating fully autonomous development sequences

#### How It Works (Sequences)

1. **Initial Setup**: The orchestrator creates a dedicated Git branch for the entire sequence.
2. **Sequential Execution**: Tasks are executed in alphabetical order by filename.
3. **Dynamic Discovery**: After each task completes, the folder is re-scanned for new tasks.
4. **Continuation**: The cycle continues until no more tasks are found.

#### Task Ordering and Naming

Tasks are executed alphabetically by filename. For workflows requiring specific ordering, use a numbered naming convention:

```
cat-herder-tasks/my-feature/
├── _PLAN.md
├── _notes_on_api_changes.md
├── 01-analyze-requirements.md
├── 02-design-architecture.md
├── 03-implement-core.md
└── 04-write-tests.md
```

#### Ignoring Files for Comments and Planning

You can include notes, plans, or other context files within a sequence folder that shouldn't be executed as tasks. The sequence orchestrator will automatically ignore any file that is prefaced with an underscore (`_`).

This allows you to keep your planning and execution in the same place.

In the example above, `_PLAN.md` and `_notes_on_api_changes.md` will be ignored by the runner, and the sequence will execute starting with `01-analyze-requirements.md`.

#### Example: Dynamic Task Generation from a PRD

This example demonstrates how an initial task can read a Product Requirements Document (`_PRD.md`) and then dynamically create a series of subsequent implementation tasks within a sequence.

1.  **Create the Sequence Folder and PRD:**
    First, create a folder for your feature sequence and an `_PRD.md` file within it. The underscore `_` ensures `_PRD.md` is ignored by the runner but available as context for your AI.

    ```bash
    # In your project root
    mkdir -p cat-herder-tasks/new-feature-implementation
    touch cat-herder-tasks/new-feature-implementation/_PRD.md
    ```

    Now, populate `cat-herder-tasks/new-feature-implementation/_PRD.md` with your feature requirements (e.g., details about a new user authentication system).

2.  **Create the Initial "Break Down PRD" Task:**
    Create a task file, `01-break-down-prd.md`, in the same folder. This task will instruct the AI to read the `_PRD.md` and then use the `Write` tool to generate the subsequent implementation tasks.

    **Remember:** When creating any task file, you need to define its YAML frontmatter, choosing the correct `pipeline` and `interactionThreshold` based on your project's `cat-herder.config.js` and the task's complexity.

    `cat-herder-tasks/new-feature-implementation/01-break-down-prd.md`:
    ```markdown
    ---
    pipeline: default
    interactionThreshold: 3 # Set a medium threshold for this planning task
    ---
    # Break Down PRD

    Analyze the provided Product Requirements Document (`_PRD.md`) in the current directory.
    Based on its content, identify the major implementation steps required for this new feature.

    For each major step, use the `Write` tool to create a new markdown task file (e.g., `02-setup-database-schema.md`, `03-implement-api-endpoints.md`, `04-create-frontend-components.md`, `05-write-integration-tests.md`). Ensure these task files are named alphabetically (e.g., `02-`, `03-`, etc.) to maintain execution order within the sequence.

    Each generated task file should:
    - Have appropriate YAML frontmatter (e.g., `pipeline: default`, `interactionThreshold`).
    - Clearly define the goal for that specific implementation step.
    - Include all necessary context from the `_PRD.md` in its body, or reference the `_PRD.md` as context if it's too large.

    **Reference:** `_PRD.md`
    ```

3.  **Run the Sequence:**
    Execute the sequence orchestrator on your feature folder:

    ```bash
    npm run cat-herder:run-sequence -- cat-herder-tasks/new-feature-implementation
    ```

    The orchestrator will:

    1.  Execute `01-break-down-prd.md`.
    2.  The AI in `01-break-down-prd.md` will read `_PRD.md` and then *create* new task files (e.g., `02-setup-database-schema.md`, `03-implement-api-endpoints.md`, etc.) in the `cat-herder-tasks/new-feature-implementation/` directory using the `Write` tool.
    3.  After `01-break-down-prd.md` completes, the orchestrator will re-scan the folder, discover the newly created tasks, and automatically execute them in alphabetical order.
    4.  The sequence will continue through each generated task, completing the entire feature implementation autonomously on a single Git branch.

This creates a fully autonomous, multi-task development workflow where the initial planning task drives the entire implementation sequence.

### Configurable Pipelines (`cat-herder.config.js`)

This tool is driven by a `pipelines` object in your `cat-herder.config.js` file. You can define multiple workflows for different kinds of tasks. Each pipeline is an array of steps, and each step is an object with these key properties:

-   `name`: A unique identifier for the step.
-   `command`: The name of the corresponding `.md` file in `.claude/commands/`.
-   `model`: (Optional) The Claude model to use for this specific step.
-   `check`: A validation object to confirm the step was successful.

```javascript
// cat-herder.config.js
module.exports = {
  taskFolder: "cat-herder-tasks",
  statePath: "~/.cat-herder/state",
  logsPath: "~/.cat-herder/logs",

  interactionThreshold: 0, 

  /**
   * If true (default), the tool automatically creates a dedicated Git branch
   * for each task. Set to false to run the tool on your current branch.
   */
  manageGitBranch: true,

  /**
   * If true, the orchestrator automatically commits changes after each
   * successful step. Set to false (default) to disable auto-commits and control
   * commits manually within your command prompts.
   */
  autoCommit: false,

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

#### Per-Step Model Selection

You can specify which Claude model to use for individual pipeline steps by adding a `model` property. This allows you to optimize your workflow by using more powerful models for complex tasks and faster, more cost-effective models for simpler tasks:

```javascript
{
  name: "implement",
  command: "implement", 
  model: "claude-opus-4-1-20250805",  // Use Opus for complex implementation
  check: { type: "shell", command: "npm test", expect: "pass" },
  // ...
},
{
  name: "docs",
  command: "docs-update",
  model: "claude-3-5-haiku-20241022",  // Use Haiku for documentation updates
  check: { type: "none" },
  // ...
}
```

If no `model` is specified, the step will use your Claude CLI's default model configuration. Valid model names are validated by the `cat-herder validate` command.

#### Pipeline Selection

The orchestrator selects a pipeline to run based on the following priority order:

1. **CLI Flag:** Use the `--pipeline <name>` option when running a task:
```bash
# Direct command
cat-herder run cat-herder-tasks/my-task.md --pipeline docs-only

# Via npm script (note the -- to pass arguments through)
npm run cat-herder:run -- cat-herder-tasks/my-task.md --pipeline docs-only
```

2. **Task Frontmatter:** Add a `pipeline` key to your task's YAML frontmatter:
```markdown
---
pipeline: docs-only
---
# My Documentation Task

Update the API documentation to reflect recent changes.
```

3. **Configuration Default:** The `defaultPipeline` property in your `cat-herder.config.js`:
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

#### Automatic Context Assembly
The orchestrator automatically assembles the necessary context for each step, ensuring the AI always has the information it needs to complete its task. This includes the overall pipeline structure, the current step's role, and relevant content such as the task definition, any generated plans, and the complete interaction history of human-AI questions and answers from previous steps in the task. This interaction history ensures that human guidance provided to earlier steps is automatically made available to all subsequent steps, maintaining consistency throughout the pipeline. No manual configuration of context providers is required.

#### Check Types
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

#### Multiple Checks (Sequential Validation)

You can specify an array of checks for more granular validation. The orchestrator will execute each check in order, and if any single check fails, the entire step validation will fail immediately:

```javascript
// Multiple checks: ensure type checking passes AND tests fail (for test-writing step)
check: [
  { type: "shell", command: "npx tsc --noEmit", expect: "pass" },
  { type: "shell", command: "npm test", expect: "fail" }
]

// Multiple validations for a build step
check: [
  { type: "shell", command: "npm run lint", expect: "pass" },
  { type: "shell", command: "npm run build", expect: "pass" },
  { type: "shell", command: "npm test", expect: "pass" }
]
```

##### Important Note on Shell Checks
When using multiple checks:
- Checks execute in the order specified
- The first failing check immediately stops execution and fails the step
- Error output will clearly indicate which specific check failed
- All checks must pass for the step to succeed

**Important:** When using `shell` checks with npm commands, the referenced script must exist in your `package.json`. For example, `"npm test"` requires a `"test"` script. The validator will check this and provide clear error messages if scripts are missing.

### Customizable Guardrails (`fileAccess`)

The `fileAccess` property allows you to control which files Claude can modify during each step of your pipeline. This provides fine-grained control over the development workflow and prevents accidental modifications to unintended files.

#### Basic Usage
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

#### Key Features
- **Glob Pattern Matching**: Uses standard glob patterns for flexible file matching (e.g., `src/**/*`, `*.md`, `test/**/*.spec.ts`)
- **Step-Specific Control**: Each pipeline step can have different file access rules
- **Optional Enforcement**: Omitting the `fileAccess` property allows unrestricted file access for that step
- **Clear Error Messages**: When a file write is blocked, you'll receive a clear message indicating which patterns are allowed

#### Common Examples
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

#### Error Handling (Guardrails)
When Claude attempts to modify a file that doesn't match the allowed patterns, the operation is blocked with a message like:
```
Blocked: The current step 'implement' only allows file modifications matching ["src/**/*"]. Action on 'README.md' denied.
```

This feature ensures that each step of your pipeline only modifies the files it should, providing confidence in your automated workflow.

### Automatic Retries on Failure

Traditional CI/CD pipelines are rigid—when a step fails, the entire process halts and requires manual intervention. The automatic retry feature transforms your pipeline into a resilient, self-healing workflow. When a check fails, the orchestrator automatically provides feedback to Claude, giving it a chance to analyze the error and fix its own work.

**The Problem:** Without retries, if your `implement` step's tests fail, the pipeline stops. You must manually examine the test output, understand what went wrong, and guide Claude to fix it.

**The Solution:** With the `retry` property, the orchestrator automatically captures the error output and feeds it back to Claude with a clear prompt, allowing it to self-correct and retry—up to the specified number of attempts.

#### Basic Configuration

Add a simple `retry` property to any pipeline step to enable automatic retries when the step's `check` validation fails:

```javascript
{
  name: "implement",
  command: "implement",
  check: { type: "shell", command: "npm test", expect: "pass" },
  fileAccess: {
    allowWrite: ["src/**/*"]
  },
  retry: 3
}
```

#### How Retries Work with Multiple Checks

When you use the `retry` property on a step that has an array of checks, the retry logic applies to the **entire step** as a whole. The process is as follows:

1.  **Sequential Execution**: The orchestrator runs each `check` in the array in order.
2.  **First Failure Halts**: If any single check fails to meet its `expect` condition, the validation process halts immediately. Subsequent checks in the array are **not** run.
3.  **Step Retry**: The entire step is considered failed, and a retry is triggered (if available).
4.  **Targeted Feedback**: The feedback prompt provided to Claude for the retry attempt will contain the specific error output from the check that failed.
5.  **Full Re-Validation**: After Claude attempts a fix, the entire sequence of checks is re-run from the beginning.

This ensures that each retry attempt is focused on fixing the specific point of failure before re-validating the entire step from scratch.

#### How It Works (Retries)

1. **Normal Execution**: Claude runs the `implement` command and modifies files in `src/`
2. **Check Validation**: The orchestrator runs `npm test` to validate the implementation
3. **On Failure**: If tests fail, instead of halting:
   - The orchestrator automatically generates a feedback prompt with the error output + the original prompt for the step
   - Claude receives this feedback and attempts to fix the issues
   - The cycle repeats up to the specified number of retries until tests pass or retries are exhausted

#### Key Features (Retries)

- **Automatic Retry**: Failed steps automatically retry with context-aware feedback
- **Error Context**: The actual error output is automatically included in the feedback
- **Configurable Limits**: Set any number of retries with the `retry` property
- **Zero Configuration**: No complex setup required—just add `retry: N` to any step

#### Common Use Cases (Retries)

**Test Failures During Implementation:**
```javascript
{
  name: "implement",
  command: "implement",
  check: { type: "shell", command: "npm test", expect: "pass" },
  fileAccess: { allowWrite: ["src/**/*"] },
  retry: 3
}
```

**Build or Lint Errors:**
```javascript
{
  name: "build",
  command: "build-code",
  check: { type: "shell", command: "npm run build", expect: "pass" },
  fileAccess: { allowWrite: ["src/**/*"] },
  retry: 2
}
```

#### Error Handling (Retries)

- **Retry Exhaustion**: After the specified number of failed attempts, the step fails permanently
- **Automatic Feedback**: The orchestrator generates clear, actionable feedback prompts automatically

This self-correction capability makes your pipelines more autonomous and reduces the need for manual intervention during development workflows.

### Handling API Rate Limits

The orchestrator is designed to be resilient against Claude API usage limits. When a rate limit is hit, the tool detects it and handles it in one of two ways.

#### Graceful Failure (Default)

By default, if the API limit is reached, the workflow will stop and display a message like this:

```
Workflow failed: Claude AI usage limit reached. Your limit will reset at 1:00:00 PM.
To automatically wait and resume, set 'waitForRateLimitReset: true' in your cat-herder.config.js.
You can re-run the command after the reset time to continue from this step.
```

Your progress is saved. Once your limit resets, simply run the exact same `cat-herder run` command again, and the orchestrator will pick up right where it left off.

#### Automatic Wait & Resume (Opt-in)

For a fully autonomous workflow, you can enable the auto-resume feature. In your `cat-herder.config.js`, set:

```javascript
module.exports = {
  // ...
  waitForRateLimitReset: true,
  // ...
};
```

With this setting, instead of failing, the tool will pause execution and log a waiting message. It will automatically resume the task as soon as the API usage limit has reset.

### Debugging and Logs

The orchestrator provides comprehensive logging to help you understand both what happened and why. For each pipeline step, three log files are created in the `~/.cat-herder/logs/` directory:

- **`XX-step-name.log`**: Contains the final, clean output from the AI tool. This is the polished result you would normally see. This log file now includes a header with the pipeline name, model, and settings used for the step, as well as start and end timestamps.
- **`XX-step-name.reasoning.log`**: Contains the AI's detailed reasoning process. This shows the step-by-step thinking that led to the final output, and also includes any user answers provided during interactive halting, creating a complete chronological transcript of the human-AI dialogue. This log file now includes a header with the pipeline name, model, and settings used for the step, as well as start and end timestamps.
- **`XX-step-name.raw.json.log`**: Contains the raw, line-by-line JSON objects streamed from the LLM. This is useful for deep debugging of the tool's behavior, as it shows every event, including tool use attempts and content chunks.

#### When to use each log
- Use the standard `.log` file to see what the AI produced and any errors that occurred.
- Use the `.reasoning.log` file to understand *why* the AI made specific decisions, especially when debugging unexpected outputs or behaviors.
- Use the `.raw.json.log` file for in-depth analysis of the raw communication with the AI, especially when diagnosing complex tool interaction issues or understanding the exact sequence of LLM events.

The reasoning logs are particularly valuable when:
- A step produces unexpected results
- You want to understand the AI's decision-making process
- You're fine-tuning your prompts or pipeline configuration
- You need to troubleshoot complex implementation choices

### State Files

The orchestrator uses state files to track the progress of tasks and sequences. These files are stored in the `~/.cat-herder/state` directory.

#### Task State File (`<task-id>.state.json`)
This file contains the status of a single task. It includes the `startTime` of the task and a `stats` object with total duration and pause time metrics.

#### Sequence State File (`<sequence-id>.state.json`)
This file contains the status of a sequence of tasks. It now includes the `startTime` of the sequence, and a `stats` object with the following fields:
- `totalDuration`: The total duration of the sequence in seconds, including pauses.
- `totalDurationExcludingPauses`: The total duration of the sequence in seconds, excluding pauses.
- `totalPauseTime`: The total pause time in seconds, including both API rate limit pauses and time spent waiting for human input during interactive halting workflows.

### Cost and Usage Monitoring

The orchestrator automatically tracks token usage for each pipeline step, providing visibility into the costs and performance of different Claude models within your workflow.

#### Token Usage in Log Files

Each step's log files now include a token usage footer with detailed consumption metrics:

```
-------------------------------------------------
--- Process finished at: 2025-08-13T15:42:30.123Z ---
--- Duration: 12.34s, Exit Code: 0 ---
--- Token Usage ---
Input Tokens: 2847
Output Tokens: 1205
Cache Creation Input Tokens: 3891
Cache Read Input Tokens: 0
```

This information appears in both the standard `.log` and `.reasoning.log` files for each step.

#### Token Usage in State Files

**Task State File (`<task-id>.state.json`):**

Token usage data is aggregated per model and stored in the task state:

```json
{
  "version": 2,
  "taskId": "my-task-20250813-154230",
  "phase": "done",
  "tokenUsage": {
    "claude-3-5-sonnet-20241022": {
      "inputTokens": 5647,
      "outputTokens": 2134,
      "cacheCreationInputTokens": 7891,
      "cacheReadInputTokens": 1024
    },
    "claude-3-5-haiku-20241022": {
      "inputTokens": 1200,
      "outputTokens": 890,
      "cacheCreationInputTokens": 0,
      "cacheReadInputTokens": 512
    }
  }
}
```

**Sequence State File (`<sequence-id>.state.json`):**

For task sequences, token usage is aggregated across all tasks in the sequence:

```json
{
  "sequenceId": "feature-sequence-20250813",
  "phase": "done",
  "stats": {
    "totalDuration": 180.45,
    "totalDurationExcludingPauses": 175.20,
    "totalPauseTime": 5.25,
    "totalTokenUsage": {
      "claude-3-5-sonnet-20241022": {
        "inputTokens": 18247,
        "outputTokens": 7834,
        "cacheCreationInputTokens": 15673,
        "cacheReadInputTokens": 3456
      },
      "claude-3-5-haiku-20241022": {
        "inputTokens": 4200,
        "outputTokens": 2890,
        "cacheCreationInputTokens": 0,
        "cacheReadInputTokens": 1536
      }
    }
  }
}
```

#### Understanding Token Types

- **Input Tokens**: Tokens sent to the model (prompt, context, instructions)
- **Output Tokens**: Tokens generated by the model (responses, code, explanations)
- **Cache Creation Input Tokens**: Tokens used to create prompt caches for efficiency
- **Cache Read Input Tokens**: Tokens read from existing prompt caches (more cost-effective)

This data enables you to:
- Monitor costs across different models in your pipeline
- Optimize model selection for different step types
- Identify steps with high token consumption
- Track cache effectiveness for cost savings

### Isolated and Resumable Git Branches

By default (`manageGitBranch: true`), the orchestrator automatically manages Git branches for you. When you run a task:

1.  It first checks that your repository has no uncommitted changes.
2.  It switches to your local `main` branch. If you have a remote repository named `origin`, it attempts to pull the latest changes to ensure you're up to date. (If you have a local-only repository, it safely skips this step).
3.  It then creates a unique, dedicated branch for the task (e.g., `claude/cat-herder-tasks-sequence-A-01-create-plan`).
4.  All commits generated by the AI during the pipeline are made to this task branch.

This keeps your `main` branch clean and isolates all automated work, whether you are working locally or with a remote team.

#### Alternative Mode
If you set `manageGitBranch: false` in your config, the tool will skip all branch management and run directly on your current branch. This is useful for advanced workflows where you want full control over Git operations, but you'll see a warning that the tool is operating on your current branch.

### Enabling Auto-Commits

By default, the orchestrator does not automatically commit changes after each pipeline step, giving you full control over your Git history. However, you can enable automatic commits or add commit instructions directly to your command prompts.

To have the orchestrator automatically commit after each successful step, set the `autoCommit` flag to `true` in your `cat-herder.config.js`:

```javascript
// cat-herder.config.js
module.exports = {
  // ...
  autoCommit: true,
  // ...
};
```

With auto-commits enabled, the orchestrator will create a checkpoint commit after each successful pipeline step with messages like `"chore(implement): checkpoint"`.

#### Adding Commit Instructions to Command Prompts

With auto-commits disabled (the default), you can instruct Claude to make commits by adding instructions directly to your command prompts. This allows you to create meaningful commit messages and group related changes together.

**Example: Adding a commit instruction to the implement step**

Modify your `.claude/commands/implement.md` file to include a commit instruction:

```markdown
---
description: Implement code so all tests pass. Do not weaken tests.
allowed-tools: Read, Write, Edit, MultiEdit, Bash(vitest:*:*), Bash(npm run:*), Bash(npm test:*), Bash(git add:*), Bash(git commit:*), Bash(git status:*)
---
Based on the PLAN.md and the failing tests, implement the necessary code in the `src/` directory to make all tests pass.

After you have verified that all tests pass, stage all changes and commit them with a meaningful message like "feat: implement new feature functionality".
```

**Important:** When adding commit instructions to custom commands, make sure to include the specific git permissions like `Bash(git add:*)`, `Bash(git commit:*)`, and `Bash(git status:*)` in the `allowed-tools` list so Claude has permission to execute git commands.

### Permissions and Security (`.claude/settings.json`)

For the orchestrator to run non-interactively, it needs permission to execute `Bash` commands like `npm test` and `git commit`. The `cat-herder init` command scaffolds a `.claude/settings.json` file with a safe set of default permissions to enable this.

This file pre-approves `Bash` commands that are essential for the default workflow using specific permission patterns like `Bash(git commit:*)` instead of broad glob patterns like `Bash(git *:*)`, which can be unreliable for commands with arguments, while denying network access. **Important:** If you have an existing `.claude/settings.json` file, the `init` command **will not overwrite it**. Instead, it will check if the necessary validation hooks are present. If they are missing, it will prompt you to add them, ensuring that security features like `fileAccess` work correctly while preserving your custom settings.

Managing these permissions is simple, even when you customize your pipeline. The **`cat-herder validate`** command is an essential tool for ensuring your workflow is correctly configured *before* you run it. It performs a comprehensive check of your `cat-herder.config.js` and project setup, including:

- **Pipeline Structure**: Verifies that steps have required properties like `name` and `command`.
- **Check Objects**: Ensures `check` steps are correctly formed (e.g., a `fileExists` check has a `path`).
- **Retry and FileAccess**: Validates that `retry` and `fileAccess` rules follow the correct format.
- **NPM Scripts**: Confirms that any `npm` command used in a `shell` check exists in your `package.json`.
- **Permissions**: Detects when a step requires a `Bash` permission that is missing from `.claude/settings.json` and offers to add it for you.

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

## Interactive Web Dashboard

`cat-herder` includes a powerful web-based dashboard for visual monitoring, real-time task and sequence tracking, and interactive collaboration with AI workflows. The dashboard provides an intuitive interface to monitor your automated workflows, view detailed task and sequence information, watch Claude's reasoning process in real-time, and answer AI questions directly from the browser when using Interactive Halting with full lifecycle awareness for both individual tasks and multi-task sequences.

### Getting Started

Start the web server using either command:

```bash
# Direct command
cat-herder web

# Via npm script
npm run cat-herder:web
```

The dashboard will be available at `http://localhost:5177` in your browser.

## Commands Reference

### CLI Commands

All commands are available directly via the `cat-herder` executable.

-   `cat-herder init`: Scaffolds the workflow in the current repository.
-   `cat-herder run <path-to-task.md>`: Runs the full workflow for a specific task.
    -   `--pipeline <name>`: Specifies which pipeline to use, overriding config and task defaults.
-   `cat-herder run-sequence <taskFolderPath>`: Runs a dynamic sequence of tasks from a specified folder.
-   `cat-herder validate`: Validates your `cat-herder.config.js` pipeline configuration.
-   `cat-herder watch`: Watches the tasks directory and runs new tasks automatically.
-   `cat-herder status`: Displays the status of the most recent task as JSON.
-   `cat-herder tui`: Launches an interactive terminal UI to monitor task progress.
-   `cat-herder web`: Starts the interactive web dashboard with real-time task monitoring and Live Activity streaming. See [Interactive Web Dashboard](#interactive-web-dashboard) for details.
-   `cat-herder ask <question>`: **(INTERNAL USE ONLY)** Used by the AI to ask a clarifying question during interactive halting.

### NPM Scripts

The `init` command adds these `cat-herder:*` scripts to your project's `package.json`:

-   `npm run cat-herder:run -- <path>`: The recommended way to run a task. Use `--` to pass additional flags like `--pipeline <name>`.
-   `npm run cat-herder:run-sequence -- <folderPath>`: The recommended way to run a task sequence from a folder.
-   `npm run cat-herder:watch`: Watches for new tasks.
-   `npm run cat-herder:status`: Shows the latest task status.
-   `npm run cat-herder:tui`: Launches the terminal UI.
-   `npm run cat-herder:web`: Starts the interactive web dashboard with real-time monitoring.

**Note:** Test scripts (like `npm test`) are not automatically added. The default pipeline includes test steps that assume you have `test`, `test:watch`, and `coverage` scripts, but you can customize your pipeline to use any testing framework or remove testing steps entirely.

## System Requirements

-   **Node.js**: Version 18.0 or higher.
-   **Git**: Must be installed and configured.
-   **Claude CLI**: The `claude` command-line tool must be installed and authenticated on your system.
-   **Package.json Scripts**: Any npm scripts referenced in your pipeline's shell commands must be defined in your `package.json`.
