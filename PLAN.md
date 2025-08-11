
# PLAN.md

## Title & Goal

**Title:** Refactor Bash Permissions for Improved Reliability

**Goal:** To improve the reliability of `git` and other `Bash` tool commands by replacing broad, unreliable glob patterns with specific, recommended permission formats throughout the project.

---

## Description

**The Problem:** Currently, the project uses broad glob patterns like `Bash(git *:*)` in its permission settings. While this seems like it should work, the permission checker in the underlying `claude` CLI tool often fails to correctly match complex commands (e.g., `git commit -m "a message"`) against this pattern. This results in unexpected "Permission Denied" errors for developers and CI/CD workflows, even when the intent was to allow the command.

**The Solution:** This change will replace the unreliable glob patterns with a more specific and officially recommended format, such as `Bash(git add:*)` and `Bash(git commit:*)`. This ensures that permissions are granted predictably. We will update the default project templates and documentation to reflect this new best practice, and ensure our `validate` command correctly identifies and helps fix these permissions.

---

## Summary Checklist

-   [ ] **Step 1:** Update the default permission settings in the project template.
-   [ ] **Step 2:** Update the `allowed-tools` in all default command markdown files.
-   [ ] **Step 3:** Update the `README.md` documentation to reflect the new best practice.

---

## Detailed Implementation Steps

### Step 1: Update Default Permission Settings

*   **Objective:** Ensure that any new project initialized via `claude-project init` is created with the new, reliable permission set from the very beginning.
*   **Task:** Modify the `allow` array within `src/dot-claude/settings.json`. This file serves as the template for all new projects.

*   **File to Edit:** `src/dot-claude/settings.json`

*   **Code Change:**

    **BEFORE:**
    ```json
    {
      "permissions": {
        "allow": [
          "Read",
          "Write",
          "Edit",
          "MultiEdit",
          "Grep",
          "Glob",
          "LS",
          "Bash(git *:*)",
          "Bash(npm *:*)",
          "Bash(vitest:*:*)",
          "Bash(node:*)"
        ],
        "deny": [
          "WebFetch",
          "WebSearch"
        ]
      },
      // ... hooks
    }
    ```

    **AFTER:**
    ```json
    {
      "permissions": {
        "allow": [
          "Read",
          "Write",
          "Edit",
          "MultiEdit",
          "Grep",
          "Glob",
          "LS",
          "Bash(node:*)",
          "Bash(git add:*)",
          "Bash(git commit:*)",
          "Bash(git diff:*)",
          "Bash(git status:*)",
          "Bash(npm run:*)",
          "Bash(npm test:*)",
          "Bash(vitest:*:*)"
        ],
        "deny": [
          "WebFetch",
          "WebSearch"
        ]
      },
      // ... hooks
    }
    ```

### Step 2: Update `allowed-tools` in Command Markdown Files

*   **Objective:** Align the default command prompts with the new specific permission patterns. This ensures the `claude-project validate` command works as expected, flagging precisely which permissions are needed for each step.
*   **Task:** Go through each `.md` file in the `src/dot-claude/commands/` directory and update the `allowed-tools` list in the YAML frontmatter.

*   **Files to Edit:**
    *   `src/dot-claude/commands/docs-update.md`
    *   `src/dot-claude/commands/implement.md`
    *   `src/dot-claude/commands/plan-task.md`
    *   `src/dot-claude/commands/self-review.md`
    *   `src/dot-claude/commands/write-tests.md`

*   **Code Change Example (`implement.md`):**

    **BEFORE:**
    ```yaml
    ---
    description: Implement code so all tests pass. Do not weaken tests.
    allowed-tools: Read, Write, Edit, MultiEdit, Bash(vitest *:*), Bash(npm *:*), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git status *)
    ---
    ```

    **AFTER (note `npm *:*` and `git *:*` are replaced):**
    ```yaml
    ---
    description: Implement code so all tests pass. Do not weaken tests.
    allowed-tools: Read, Write, Edit, MultiEdit, Bash(vitest:*:*), Bash(npm test:*) Bash(git diff:*) Bash(git add:*) Bash(git commit:*) Bash(git status:*)
    ---
    ```
    *Apply similar targeted changes to all other command files, ensuring each command only lists the specific `Bash(...)` permissions it actually needs.*

### Step 3: Update README.md Documentation

*   **Objective:** To clearly document the new, recommended permission format for users, especially those who customize their pipelines or command prompts.
*   **Task:** Update the "Permissions and Security" and the "Enabling Auto-Commits" sections in `README.md` to use and explain the new patterns.

*   **File to Edit:** `README.md`

*   **Content Change (in the "Permissions and Security" section):**

    Update the explanation and the example code block to reflect the new best practice.

    **SUGGESTED TEXT:**

    > ...This file pre-approves `Bash` commands that are essential for the default workflow. To ensure reliability, we use specific permission patterns like `Bash(git commit:*)` instead of broad glob patterns like `Bash(git *:*)`, which can be unreliable for commands with arguments. **Important:** If you have an existing...

    Replace the code block in this section with an example showing the new, specific patterns.

---

## Error Handling & Warnings

*   With these changes, the `claude-project validate` command will now function more accurately.
*   If a user creates a custom command that needs `git commit` but forgets to add `Bash(git commit:*)` to the frontmatter, the validator will now correctly identify `Bash(git commit:*)` as a missing permission.
*   The CLI will then prompt the user with: `Would you like to add these permissions to .claude/settings.json? (y/N)`. This is the desired behavior. No new error-handling logic is needed; the existing logic will now work with more precise data.