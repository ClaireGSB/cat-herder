# Project Architecture (`ARCHITECTURE.md`)

## 1. Overview

This document outlines the architecture of the `@your-scope/cat-herder` tool. Its purpose is to provide a high-level understanding of the system's components, their interactions, and the guiding principles for future development and refactoring.

The project is a command-line tool that orchestrates an AI-driven, step-gated development workflow. It uses a user-defined pipeline configuration to execute a series of steps (e.g., planning, testing, implementing) for a given task, using the Claude CLI as its engine for AI-powered actions.

---

## 2. Core Architectural Concepts

The system is designed around a few key concepts to ensure it is resilient, customizable, and maintainable.

### A. Separation of Concerns

The architecture is split into distinct layers, each with a clear responsibility.

1.  **Interface Layer (CLI & Web):** The user's entry point. This layer is responsible for parsing user input and presenting status information.
    *   **CLI (`src/index.ts`, `src/cli-actions.ts`):** Uses `commander` to define commands and options. It triggers the core orchestrator and handles process-level concerns like exit codes.
    *   **Web Dashboard (`src/tools/web/`):** An optional monitoring layer. It runs as a separate process and reads from the State Layer to provide a real-time view of the workflow.

2.  **Orchestration Layer (`src/tools/orchestration/`):** The heart of the application. This layer is responsible for executing the defined workflow.
    *   It reads the user's pipeline configuration (`cat-herder.config.js`).
    *   It manages the overall flow of a task or sequence.
    *   It prepares the necessary context and prompts for each step.
    *   It invokes the AI Interaction Layer to execute a step.
    *   It runs validation checks (`check-runner.ts`) to verify the outcome of each step.

3.  **AI Interaction Layer (`src/tools/proc.ts`):** The bridge to the Claude AI.
    *   This layer's sole responsibility is to spawn and manage the `claude` CLI tool as a child process.
    *   It streams the JSON output from the `claude` tool, parsing events for logging, reasoning, and final results.
    *   It handles process lifecycle events, including graceful shutdown on interruption (`SIGINT`).

4.  **State Layer (`src/tools/status.ts`):** The system's source of truth and memory.
    *   It manages reading and writing status files (e.g., `<task-id>.state.json`) in the `.claude/state` directory.
    *   This layer makes the entire workflow **resumable**. If a task is interrupted or fails, the orchestrator can read the last known state and continue from the last incomplete step.
    *   The state files also serve as the data source for the Web Dashboard, decoupling the UI from the core orchestration logic.

### B. Data Flow Diagram

The following diagram illustrates the interaction between the core components when a user runs a task.

```mermaid
graph TD
    subgraph User Interface
        CLI[CLI: cat-herder run]
        Web[Web Dashboard]
    end

    subgraph Orchestration Layer
        Orchestrator[Orchestrator]
        Validator[Pipeline Validator]
        CheckRunner[Check Runner]
    end

    subgraph State & Config
        State[State Files (.json)]
        Config[cat-herder.config.js]
        Prompts[Command Prompts (.md)]
    end

    subgraph AI Interaction
        Proc[Process Runner (proc.ts)]
        ClaudeCLI[Claude CLI (child process)]
    end

    User[User] --> CLI
    CLI --> Orchestrator
    Orchestrator -- Reads --> Config
    Orchestrator -- Uses --> Validator
    Orchestrator -- Reads/Writes --> State
    Orchestrator -- Reads --> Prompts
    Orchestrator -- Calls --> Proc
    Proc -- Spawns --> ClaudeCLI
    ClaudeCLI -- Modifies --> UserFiles[User's Source Code]
    Orchestrator -- Uses --> CheckRunner
    CheckRunner -- Executes --> Shell[Shell Commands (npm test)]

    Web -- Reads --> State
    User -- Views --> Web
```

### C. Key Directories

*   **`src/`**: The main application source code.
    *   **`src/tools/`**: Contains the core logic for orchestration, web UI, validation, and status management. This is the engine of the application.
    *   **`src/templates/`**: EJS templates for the web dashboard and default configuration files (`cat-herder.config.js`).
    *   **`src/init/`**: Logic related to the `cat-herder init` command.
*   **`.claude/` (in user's project)**: The user-facing configuration directory.
    *   **`commands/`**: User-customizable markdown prompts for each pipeline step.
    *   **`settings.json`**: Permissions and hooks for the `claude` CLI tool.
    *   **`state/`**: Contains the JSON state files that track the progress of tasks and sequences. **This directory should be in `.gitignore`**.
    *   **`logs/`**: Detailed logs for each step of every task run, crucial for debugging. **This directory should also be in `.gitignore`**.

---

## 3. Architectural Decisions and Trade-offs

This section documents key design choices and their rationale, providing context for future development.

*   **Decision: Wrap the `claude` CLI as a child process instead of using a direct API client.**
    *   **Rationale:** This approach allows our tool to seamlessly inherit the user's existing environment. Authentication, custom settings (`settings.json`), and default model configurations are handled by the `claude` tool, simplifying our logic and respecting the user's setup.
    *   **Trade-off:** We are dependent on the CLI's stability and its JSON streaming output format. This is a favorable trade-off for the initial version as it significantly reduces complexity.

*   **Decision: Use a file-based system (`.claude/state/*.json`) for state management.**
    *   **Rationale:** This makes the entire workflow resumable with zero external dependencies (like a database). The state is human-readable, which is invaluable for debugging failed runs. The use of atomic writes (writing to a `.tmp` file then renaming) mitigates race conditions.
    *   **Trade-off:** The system is not designed for high-concurrency parallelism on a single repository. This is acceptable as the primary use case is a single, sequential workflow per user action.

*   **Decision: Expose AI prompts as user-editable `.md` files in `.claude/commands/`.**
    *   **Rationale:** The core value of an AI orchestration tool is the ability to customize the AI's behavior. By externalizing prompts, we give users maximum control over their workflows without needing to modify the tool's source code.
    *   **Trade-off:** The tool's performance is directly tied to the quality of the user's prompts. We provide sensible defaults, but the user is ultimately responsible for effective prompt engineering.

---

## 4. Testing Strategy

Maintaining a high-quality, regression-free tool requires a multi-layered testing strategy.

*   **Unit Tests:** Used for pure, isolated logic. They should have no dependency on the file system or child processes.
    *   **Examples:** Utility functions, configuration validators, prompt assembly logic.
    *   **Location:** Colocated with the module being tested (e.g., `validator.test.ts`).

*   **Integration Tests:** Verify the contracts and interactions between different internal modules. These may involve mocks for the file system or child processes.
    *   **Examples:** Testing the orchestrator's retry logic (`orchestrator-retry.test.ts`), ensuring the orchestrator correctly updates the status file after a step.
    *   **Location:** In the `/test` directory.

*   **End-to-End (E2E) Tests:** The highest level of testing, validating the entire user workflow from a black-box perspective.
    *   **Methodology:** As described in the `README.md`, our E2E tests involve scripting the creation of a clean test project, running `cat-herder init`, and executing a sample `cat-herder run` command to ensure the entire pipeline executes successfully.
    *   **Example:** `init-integration.test.ts`.

---

## 5. Security Model and Guardrails

As a tool that executes commands and modifies code, security is a primary concern. Our model is built on transparency and explicit user consent.

*   **Principle of Least Privilege:** The tool itself does not grant permissions. It is subject to the permissions defined by the user for the underlying `claude` CLI.
*   **Centralized Permissions (`.claude/settings.json`):** All potentially sensitive operations, primarily `Bash` command execution, must be explicitly allowed by the user in this file. The tool will not run if a required permission is missing.
*   **Proactive Validation:** The `cat-herder validate` command acts as a safety check. It scans the pipeline configuration and cross-references it with `settings.json`, informing the user of any missing permissions *before* a run is attempted.
*   **Step-Specific Guardrails (`fileAccess`):** The `fileAccess` property in `cat-herder.config.js` provides a critical layer of defense against unintended file modifications. It ensures that each step of the pipeline can only write to a predefined set of files or directories, preventing, for instance, a documentation step from altering source code.

---

## 6. Guiding Principles for Future Development

To maintain the project's quality and clarity, all new features and refactors should adhere to the following principles.

1.  **Maintain Small, Focused Modules.**
    *   Files should ideally be under 300 lines and adhere to the Single Responsibility Principle (SRP). A file should do one thing and do it well.
    *   **Example:** Git operations belong in a dedicated `git.ts` module, not mixed with pipeline execution logic.

2.  **Preserve the State-Driven, Resumable Workflow.**
    *   The core architecture relies on state files for resilience. Any new feature should work within this paradigm.
    *   Avoid in-memory state that is lost on exit. All progress must be written to a state file to ensure tasks can be resumed.

3.  **Configuration Over Code.**
    *   The tool's power comes from its flexibility. Prefer making new behaviors configurable in `cat-herder.config.js` rather than hardcoding them.
    *   When adding new configurable options, ensure the `validate` command is updated to check them.

4.  **Prioritize Developer Experience (DX).**
    *   This is a tool for developers. Error messages should be clear and actionable.
    *   The `validate` command is a cornerstone of good DX. It should be extended to cover any new configuration to help users avoid runtime errors.
    *   Logging should be comprehensive but well-organized (e.g., separating clean output from reasoning and raw JSON).

5.  **Keep Core Logic Decoupled from Interfaces.**
    *   The orchestrator should have no knowledge of the Web Dashboard or the specifics of the `commander` CLI. It should only focus on executing the pipeline.
    *   This allows us to add new interfaces (e.g., a different TUI, an API) in the future without rewriting the core engine.

---

## 7. Code and Module Best Practices

To support the guiding principles, we adhere to specific best practices for code structure and module design. These rules are derived from lessons learned during development and are critical for maintaining a clean, scalable, and bug-resistant codebase.

### A. Keep Dependencies Flowing Downhill

**The Principle:** Dependencies must always flow from high-level modules (which orchestrate complex logic) to low-level, stable modules (which provide focused utilities or types). A low-level module should **never** import a high-level module.

*   **High-Level (Uphill):** Orchestrators, runners, CLI actions (`orchestrator.ts`, `step-runner.ts`, `cli-actions.ts`).
*   **Low-Level (Downhill):** Utilities, types, configurations, standalone classes (`utils/`, `config.ts`, `tools/orchestration/errors.ts`).

**Why it Matters:** This is the single most important rule for **preventing circular dependencies**. When a high-level module like `sequence-runner.ts` imports another high-level module like `step-runner.ts`, it creates a tight coupling that can easily lead to import loops as the project grows.

**Practical Example:**
*   **Problem:** We encountered a circular dependency because `sequence-runner.ts` needed `InterruptedError`, which was defined inside `step-runner.ts`. This forced a high-level module to depend on another high-level module for a low-level concept.
*   **Solution:** We applied this principle by extracting `InterruptedError` into its own low-level, stable module (`src/tools/orchestration/errors.ts`). Now, both `step-runner.ts` and `sequence-runner.ts` can depend "downhill" on `errors.ts`, breaking the circular dependency between them.

### B. Prefer Static over Dynamic Imports for Module Logic

**The Principle:** All imports for inter-module dependencies and Node.js built-ins should be standard, static `import` statements at the top of the file. Avoid using dynamic `await import(...)` inside functions for this purpose.

**Why it Matters:**
*   **Clarity:** Static imports clearly declare a module's dependencies at a glance. Dynamic imports hide them within the implementation logic.
*   **Static Analysis:** Tools like TypeScript and bundlers rely on static imports to analyze the dependency graph, detect circular dependencies, and perform tree-shaking.
*   **Safety:** Errors in static imports (e.g., a typo in the path) are caught at compile time. Errors in dynamic imports are only discovered at runtime when the function is executed.

**Practical Example:**
*   **Problem:** The `step-runner.ts` file used `await import('node:child_process')` and `await import('../status.js')` inside its main function. This was a workaround for other architectural issues.
*   **Solution:** Once the circular dependency was resolved, we replaced all dynamic imports with standard `import { execSync } from 'node:child_process';` and `import { updateSequenceStatus } from '../status.js';` at the top of the file.

### C. Import Directly from the Source of Truth

**The Principle:** When importing a function, class, or type, the import path should point directly to the file that defines it. Avoid re-exporting modules from intermediary "index" or "barrel" files unless it's a public-facing API for a large library.

**Why it Matters:** This practice makes the codebase much easier to navigate and refactor. When a developer sees `import { runTaskSequence } from './orchestration/sequence-runner.js'`, they know exactly where to find that code. An indirect import, like `from './orchestrator.js'`, would be misleading.

**Practical Example:**
*   **Problem:** Initially, `orchestrator.ts` re-exported the `runTaskSequence` function from `sequence-runner.ts`. The `cli-actions.ts` file then imported it from `orchestrator.ts`.
*   **Solution:** We removed the re-export from `orchestrator.ts` and updated `cli-actions.ts` to import `runTaskSequence` directly from its source file, `src/tools/orchestration/sequence-runner.js`. This makes the dependency path clear and honest.

---

## 8. A Living Document

This document is not static. It must evolve with the project.

**Process Requirement:** For any significant new feature or refactoring, the development process must be:

1.  Create a `PLAN.md` outlining the proposed changes.
2.  Implement the changes as described.
3.  **As the final step, update this `ARCHITECTURE.md` file** (as well as the README.md of course) to reflect any changes to the system's structure, components, or guiding principles.

By following this process, we ensure that our documentation remains an accurate and valuable resource for everyone involved in the project.