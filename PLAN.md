

# Implementation Plan: Non-Interactive Permissions via `settings.json`

### Goal

To enable a fully automated, non-interactive pipeline execution by providing a default `.claude/settings.json` file. This file will pre-authorize the specific `Bash` commands required by the default pipeline (e.g., `npm`, `git`), thereby eliminating the need for interactive permission prompts from the `claude` CLI during a run.

### Description

The `claude` command-line tool, for security reasons, prompts the user for permission before executing powerful tools like `Bash`. In an automated workflow, these prompts halt the process and are undesirable. The official mechanism to grant persistent, non-interactive permissions is a `.claude/settings.json` file in the root of the user's project.

This task involves creating a default `settings.json` template within our tool's source code and updating the `init` command to scaffold it into the user's project.

**Handling Existing Files:** If a user already has a `.claude/settings.json` file, **we will not overwrite it**. The `init` command will detect the existing file and skip the copy process, printing a message to the user. This is a critical safety measure to respect any custom configurations the user may have already created.

---

## Summary Checklist

-   [ ] **Step 1:** Create the Default `settings.json` Template
-   [ ] **Step 2:** Update the `init` Command to Safely Copy the Template
-   [ ] **Step 3:** Update Documentation to Explain the `settings.json` File

---

## Detailed Implementation Steps

### Step 1: Create the Default `settings.json` Template

**Objective:** Create the permissions file with a set of safe but sufficient defaults for the pipeline to operate.

**Task:** Create a new file at `src/dot-claude/settings.json`. The `dot-claude` directory should already exist and contain your `commands` subdirectory.

**File: `src/dot-claude/settings.json` (New File)**
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
  "hooks": {}
}
```
*   **Rationale:** This configuration allows all standard file operations and explicitly permits `Bash` commands that start with `git` or `npm`, which are essential for committing code and running tests. It denies potentially unsafe network tools like `WebFetch` and `WebSearch`.

### Step 2: Update the `init` Command to Safely Copy the Template

**Objective:** Modify the `init` command to copy the entire `.claude` directory (which now includes `settings.json` and `commands/`) into the user's project, ensuring it does not overwrite existing files.

**Task:** The existing `fs.copy` command in `init.ts` is already configured correctly with `overwrite: false`. We simply need to ensure the new `settings.json` file is in the source `src/dot-claude` directory and that the console log message is clear to the user.

**File: `src/init.ts` (Review and Confirm)**
```typescript
import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import { mergePackageJson } from "./utils/pkg.js";

export async function init(targetRoot: string) {
  console.log(pc.cyan("Initializing claude-project..."));

  // ... (config file creation)

  // This block of code handles the copy. It is already correct.
  // By copying the parent `dot-claude` directory, it will automatically
  // include the new `settings.json` file. The `overwrite: false`
  // option correctly handles the case where the user already has files.
  const dotClaudeTemplatePath = path.resolve(new URL("../dot-claude", import.meta.url).pathname);
  const targetDotClaudePath = path.join(targetRoot, ".claude");
  await fs.copy(dotClaudeTemplatePath, targetDotClaudePath, {
      overwrite: false,
      errorOnExist: false,
  });
  
  // Update the log message to be more descriptive.
  console.log(pc.green("Created .claude/ directory with default commands and settings."));

  // ... (rest of the file remains the same)
}
```

### Step 3: Update Documentation

**Objective:** Inform the user about the new `.claude/settings.json` file in the `README.md` so they understand its purpose.

**Task:** Add a new subsection to the "How It Works" section of the main `README.md`.

**File: `README.md` (Add this new section)**

### Permissions and Security (`.claude/settings.json`)

For the orchestrator to run non-interactively, it needs permission to execute commands like `npm test` and `git commit`. The `claude-project init` command scaffolds a `.claude/settings.json` file with a safe set of default permissions.

This file pre-approves `Bash` commands that are essential for the workflow (scoped to `npm` and `git`) while denying network access. If you have an existing `settings.json`, `init` will not overwrite it. You can customize this file to tighten or expand permissions according to your project's security requirements.```