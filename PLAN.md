Of course. Here is a detailed `PLAN.md` that you can hand over to a junior developer. It breaks down the project into clear, manageable steps with code snippets and explanations.

---

# PLAN.md

## Title & Goal

**Title:** Implement Optional Auto-Commit and Empower User-Defined Commits

**Goal:** To make the automatic Git commit feature optional, allowing users to control commits directly within their command prompts.

## Description

Currently, the `claude-project` orchestrator automatically commits changes after every successful pipeline step. This behavior is helpful but rigid. It prevents users from grouping multiple smaller changes into a single, logical commit.

This project will introduce an `autoCommit` flag in `claude.config.js`. When set to `false`, the system will no longer create commits automatically. Instead, users can add natural language instructions (e.g., *"commit the changes with the message 'feat: add new feature'"*) to their command prompts. This gives users full control over their Git history without adding complexity to the pipeline structure.

## Summary Checklist

- [x] **Step 1: Update Configuration** - Add the `autoCommit` flag to the configuration schema and template.
- [ ] **Step 2: Modify Orchestrator** - Update the core logic to respect the `autoCommit` flag.
- [ ] **Step 3: Grant Command Permissions** - Add Git permissions to default command templates so users can trigger commits.
- [ ] **Step 4: Update Documentation** - Explain the new feature and how to use it in the `README.md`.

---

## Detailed Implementation Steps

### Step 1: Update Configuration

**Objective:** Add a new `autoCommit` flag to the project configuration so users can enable or disable the feature.

**Tasks:**

1.  **Modify the configuration interface in `src/config.ts`:**
    *   Add an optional `autoCommit?: boolean;` property to the `ClaudeProjectConfig` interface.
    *   In the `defaultConfig` object, set `autoCommit: false` 

    **Code Snippet (`src/config.ts`):**
    ```typescript
    export interface ClaudeProjectConfig {
      // ... existing properties
      manageGitBranch?: boolean;
      autoCommit?: boolean; // Add this line
      waitForRateLimitReset?: boolean;
      // ... existing properties
    }

    const defaultConfig: Omit<ClaudeProjectConfig, "pipelines" | "defaultPipeline" | "pipeline"> = {
      // ... existing defaults
      manageGitBranch: true,
      autoCommit: false, // Add this default
      waitForRateLimitReset: false,
    };
    ```

2.  **Update the configuration template in `src/templates/claude.config.js`:**
    *   Add the `autoCommit` property with a clear comment explaining its purpose.

    **Code Snippet (`src/templates/claude.config.js`):**
    ```javascript
    /**
     * If true , the orchestrator automatically commits changes after each
     * successful step. Set this to false (the default) to disable this behavior.
     */
    autoCommit: true,
    ```

### Step 2: Modify the Orchestrator

**Objective:** Make the core commit logic in the orchestrator conditional on the `autoCommit` flag.

**Tasks:**

1.  **Modify the `executeStep` function in `src/tools/orchestrator.ts`:**
    *   Load the project configuration using `getConfig()`.
    *   Locate the section where a successful step is handled (`if (checkResult.success)`).
    *   Wrap the existing `git add` and `git commit` commands inside an `if (config.autoCommit)` block.
    *   Add an `else` block to log a message indicating that the step was successful but auto-commit was skipped.

    **Code Snippet (`src/tools/orchestrator.ts`):**
    ```typescript
    async function executeStep(
      // ... function arguments
    ) {
      // ...
      const config = await getConfig(); // Load config
      // ...

      // Inside the for-loop for retries...
      const checkResult = await runCheck(check, projectRoot);

      if (checkResult.success) {
        // Check passed - decide whether to commit
        if (config.autoCommit) {
          console.log(`[Orchestrator] Committing checkpoint for step: ${name}`);
          execSync(`git add -A`, { stdio: "inherit", cwd: projectRoot });
          execSync(`git commit -m "chore(${name}): checkpoint"`, { stdio: "inherit", cwd: projectRoot });
        } else {
          console.log(pc.gray(`[Orchestrator] Step "${name}" successful. Auto-commit is disabled.`));
        }
        updateStatus(statusFile, s => { s.phase = "pending"; s.steps[name] = "done"; });
        return; // Success
      }
      // ...
    }
    ```

### Step 3: Grant Command Permissions

**Objective:** Allow users to trigger commits from any step by adding the necessary Git permissions to the default command templates.

**Tasks:**

1.  **Modify the frontmatter in the default command files:**
    *   For each of the files below, add `Bash(git *:*)` to the `allowed-tools` list.
    *   `src/dot-claude/commands/plan-task.md`
    *   `src/dot-claude/commands/docs-update.md`
    *   `src/dot-claude/commands/self-review.md`

    **Code Snippet (Example for `docs-update.md`):**
    ```markdown
    ---
    description: Update docs for the change.
    allowed-tools: Read, Write, Edit, Glob, Bash(git *:*)
    ---
    Based on the recent code changes, please update the project's documentation.
    ...
    ```

### Step 4: Update Documentation

**Objective:** Clearly document the new feature in the `README.md` file so users understand how to use it.

**Tasks:**

1.  **Modify `README.md`:**
    *   Update the example `claude.config.js` to show the `autoCommit` flag.
    *   Add a new section titled **"Controlling Commits Manually"**.
    *   In this new section:
        *   Explain how to disable auto-commits by setting `autoCommit: false`.
        *   Provide a clear example of how to add a commit instruction to a command prompt (e.g., modifying `implement.md`).

    **Content Snippet (`README.md`):**
    ```markdown
    ### Enabling Auto-Commits

    By default, this tool doesn't automatically commit the results of each successful pipeline step to allow for manual control. However, you can enable the auto-commit feature.

    **How to Enable Auto-Commits:**

    In your `claude.config.js` file, set the `autoCommit` flag to `true`:

    ```javascript
    // claude.config.js
    module.exports = {
      // ...
      autoCommit: true,
      // ...
    };
    ```

    **Adding Commits to Your Prompts:**

    With auto-commit disabled, you can instruct Claude to make commits by adding instructions directly to your command prompts (the `.md` files in your `.claude/commands/` directory).

    For example, to commit after the implementation step, you could modify `implement.md`:

    ```markdown
    <!-- .claude/commands/implement.md -->
    ---
    description: Implement code so all tests pass. Do not weaken tests.
    allowed-tools: Read, Write, Edit, MultiEdit, Bash(vitest *:*), Bash(npm *:*)
    ---
    Based on the PLAN.md and the failing tests, implement the necessary code in the `src/` directory to make all tests pass.

    After you have verified the tests pass, **stage all changes and commit them with the message "feat: implement new math utility".**
    ```
    ```

## Error Handling & Warnings

*   **Missing Configuration:** If `autoCommit` is not present in a user's config file, the system will default to `true`. No error will be thrown.
*   **Disabled Auto-Commit:** When `autoCommit` is `false`, the orchestrator should print a gray-colored log to the console: `[Orchestrator] Step "step-name" successful. Auto-commit is disabled.`. This confirms the expected behavior.
*   **Missing Permissions:** If a user tries to add a commit instruction to a custom command but forgets to add `Bash(git *:*)` to the frontmatter, the `claude` CLI will block the tool use and report a missing permission error. No new error handling is required for this, as it's covered by existing features.