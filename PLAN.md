
# Implementation Plan: Permission Validation in Pipeline

### Goal

To enhance the `claude-project validate` command and the silent pre-run check to analyze the `allowed-tools` in every command file of the pipeline and verify that those tools are granted permission in the project's `.claude/settings.json` file.

### Description

A common source of runtime failure is a mismatch between the tools a command needs (defined in its `.md` frontmatter) and the permissions granted in `settings.json`. We will build a validator that:
1.  Reads the user's `claude.config.js` to get the pipeline.
2.  For each step in the pipeline, it reads the corresponding `.claude/commands/{{command}}.md` file.
3.  It parses the `allowed-tools` frontmatter from the command file.
4.  It reads the user's `.claude/settings.json` file to get the list of allowed permissions.
5.  It compares the two, checking that every tool required by a command is permitted by the settings.
6.  If a permission is missing, the validator will report a clear, actionable error, telling the user exactly what they need to add to their `settings.json`.

This proactive check prevents an entire class of frustrating, non-obvious runtime errors.

---

## Summary Checklist

-   [ ] **Step 1:** Enhance the Pipeline Validator to Perform Permission Checks
-   [ ] **Step 2:** Update the `validate` Command's Output to Display Permission Errors

---

## Detailed Implementation Steps

### Step 1: Enhance the Pipeline Validator

**Objective:** Add the core logic for parsing frontmatter and comparing `allowed-tools` against `settings.json` permissions.

**Task:** We will add a new section to the main loop inside `src/tools/validator.ts`. We will also need a small utility to parse the YAML frontmatter from the command files.

**Prerequisite: Add a YAML parsing library.**
`js-yaml` is a standard, lightweight choice. We will also need its types.
```bash
npm install js-yaml
npm install @types/js-yaml --save-dev
```

**File: `src/tools/validator.ts` (Updated)**
```typescript
import fs from "fs";
import path from "path";
import yaml from "js-yaml"; // <-- Import the new library
import { ClaudeProjectConfig } from "../config.js";
import { contextProviders } from "./providers.js";

/**
 * A simple utility to parse YAML frontmatter from a markdown file.
 * @param content The string content of the markdown file.
 * @returns The parsed frontmatter as an object, or null if not found.
 */
function parseFrontmatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\s*([\s\S]+?)\s*---/);
  if (match) {
    return yaml.load(match[1]) as Record<string, any>;
  }
  return null;
}

export function validatePipeline(config: ClaudeProjectConfig, projectRoot: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const knownContextKeys = Object.keys(contextProviders);
  const validCheckTypes = ["none", "fileExists", "shell"];

  // 1. Load settings.json permissions
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  let allowedPermissions: string[] = [];
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      allowedPermissions = settings?.permissions?.allow || [];
    } catch {
      errors.push("Could not parse .claude/settings.json. Please ensure it is valid JSON.");
    }
  } else {
    errors.push(".claude/settings.json not found. Please run `claude-project init` to create a default one.");
  }

  if (!config.pipeline || !Array.isArray(config.pipeline)) {
    errors.push("Config is missing a valid 'pipeline' array.");
    return { isValid: false, errors };
  }

  // 2. Loop through each step in the pipeline
  for (const [index, step] of config.pipeline.entries()) {
    const stepNum = index + 1;
    // ... (existing checks for command file, context, and check objects remain the same)
    
    // 3. Perform the new permission check
    const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
    if (fs.existsSync(commandFilePath)) {
      const commandContent = fs.readFileSync(commandFilePath, 'utf-8');
      const frontmatter = parseFrontmatter(commandContent);
      const requiredTools: string[] = frontmatter?.['allowed-tools'] || [];
      
      for (const tool of requiredTools) {
        // This is a simple check. It can be made more robust to handle wildcards like "Bash(npm *:*)".
        // For now, we'll do an exact match for simplicity.
        if (!allowedPermissions.includes(tool)) {
          errors.push(`Step ${stepNum} ('${step.name}'): Command requires tool "${tool}", which is not listed in the "allow" section of .claude/settings.json.`);
        }
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}
```
**Note on Wildcards:** The simple `.includes()` check is a good starting point. A V2 improvement could be a more sophisticated matcher that understands wildcards (e.g., `Bash(npm install)` is permitted by `Bash(npm *:*)`). For the initial implementation, an exact match is sufficient and clear.

### Step 2: Update the `validate` Command's Output

**Objective:** No code changes are needed here. The existing `validate` command in `index.ts` already iterates through the `errors` array and prints each one. Because we've added a new type of error to that array, it will be displayed automatically.

**Task:** Review the `validate` command in `src/index.ts` and confirm it is sufficient.

**File: `src/index.ts` (Review - No Changes Needed)**
```typescript
// ...
program
  .command("validate")
  .description("Validates the claude.config.js pipeline.")
  .action(async () => {
    // ...
    const { isValid, errors } = validatePipeline(config, projectRoot);

    if (isValid) {
      // ... success message
    } else {
      console.error(pc.red("✖ Pipeline configuration is invalid:\n"));
      // This loop will now also print our new permission errors!
      for (const error of errors) {
        console.error(pc.yellow(`  - ${error}`));
      }
      process.exit(1);
    }
    // ...
  });
// ...
```

### The New User Experience

With this change, the user's workflow is significantly safer.

**Scenario:** The user adds a new `deploy` step to their pipeline that uses the `kubectl` command, but forgets to update their permissions.

1.  They create `.claude/commands/deploy.md` with `allowed-tools: [Bash(kubectl apply *:*)]`.
2.  They add the `deploy` step to their `pipeline` in `claude.config.js`.
3.  They run `claude-project validate`.

**New Output:**
```
✖ Pipeline configuration is invalid:

  - Step 7 ('deploy'): Command requires tool "Bash(kubectl apply *:*)", which is not listed in the "allow" section of .claude/settings.json.

Please fix the errors above and run 'claude-project validate' again.
```
The user now knows *exactly* what to do: open `settings.json` and add the required permission to the `allow` array. This prevents a frustrating and potentially confusing runtime failure.