

---

# Implementation Plan: Interactive Permission Helper

### Goal

To enhance the `claude-project validate` command to be interactive. When it detects that a command in the pipeline requires a permission not present in `.claude/settings.json`, it will clearly list the missing permissions and prompt the user to automatically add them.

### Description

Instead of simply failing, the validator will become a powerful setup tool. The new user workflow will be:
1.  A user customizes their pipeline by adding a new step with a new command (e.g., a `lint` step).
2.  They run `claude-project validate`.
3.  The tool detects that the new command requires `Bash(npm run lint:fix)`, which is missing from `settings.json`.
4.  Instead of just erroring, it will display the missing permission and ask: `Would you like to add the missing permissions to .claude/settings.json? (y/N)`.
5.  If the user presses `y`, the tool will safely read `settings.json`, add the new permission(s) to the `allow` array (without deleting existing ones), and write the file back.

This provides a seamless, guided experience for configuring the pipeline's security requirements. The silent validation in the `run` command will remain non-interactive and simply report the error as it does now.

---

## Summary Checklist

-   [x] **Step 1:** Modify the Validator to Return Structured Data
-   [x] **Step 2:** Implement the Interactive `validate` Command in `index.ts`
-   [x] **Step 3:** (No Change) Confirm the `run` Command's Validator Remains Non-Interactive

---

## Detailed Implementation Steps

### Step 1: Modify the Validator to Return Structured Data

**Objective:** The validator needs to distinguish between general errors and fixable permission errors. We will change its return type to provide this structured data.

**Task:** Replace the contents of `src/tools/validator.ts` with this new version.

**File: `src/tools/validator.ts` (Updated)**
```typescript
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { ClaudeProjectConfig } from "../config.js";
import { contextProviders } from "./providers.js";

function parseFrontmatter(content: string): Record<string, any> | null {
  // ... (this function remains the same)
}

// The new return type for our function
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  missingPermissions: string[];
}

export function validatePipeline(config: ClaudeProjectConfig, projectRoot: string): ValidationResult {
  const errors: string[] = [];
  const missingPermissions: string[] = []; // <-- New array for fixable errors
  // ... (loading settings.json and other setup is the same)

  // --- Main Loop ---
  for (const [index, step] of config.pipeline.entries()) {
    // ... (existing checks for step structure are the same)
    
    // --- Permission Check Logic ---
    const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
    if (fs.existsSync(commandFilePath)) {
      const commandContent = fs.readFileSync(commandFilePath, 'utf-8');
      const frontmatter = parseFrontmatter(commandContent);
      const toolsValue = frontmatter?.['allowed-tools'];
      
      let requiredTools: string[] = [];
      if (typeof toolsValue === 'string') {
        requiredTools = toolsValue.split(',').map(tool => tool.trim()).filter(Boolean);
      } else if (Array.isArray(toolsValue)) {
        requiredTools = toolsValue;
      }
      
      for (const tool of requiredTools) {
        if (tool && !allowedPermissions.includes(tool)) {
          // Instead of just a generic error, we add to both arrays
          const errorMessage = `Step ${index + 1} ('${step.name}'): Requires missing permission "${tool}"`;
          errors.push(errorMessage);
          missingPermissions.push(tool); // <-- Add to the structured list
        }
      }
    }
    // ... (rest of the checks)
  }

  // Use a Set to remove duplicate missing permissions before returning
  const uniqueMissingPermissions = [...new Set(missingPermissions)];

  return { 
    isValid: errors.length === 0, 
    errors,
    missingPermissions: uniqueMissingPermissions,
  };
}
```

### Step 2: Implement the Interactive `validate` Command

**Objective:** This is the core of the feature. We'll rewrite the `validate` command to use the new structured data from the validator, display the errors, and present the interactive prompt if there are fixable permission issues.

**Task:** Replace the `validate` command's action in `src/index.ts`.

**File: `src/index.ts` (Updated `validate` command)**
```typescript
#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import fs from "fs";
import path from "path";
import readline from "readline"; // <-- Import readline for prompts
import { init } from "./init.js";
// ... (other imports)
import { validatePipeline } from "./tools/validator.js";
import { getConfig, getProjectRoot } from "./config.js";

// ... (program definition and other commands)

program
  .command("validate")
  .description("Validates the claude.config.js pipeline and offers to fix permissions.")
  .action(async () => {
    try {
      const config = await getConfig();
      const projectRoot = getProjectRoot();
      const { isValid, errors, missingPermissions } = validatePipeline(config, projectRoot);

      if (isValid) {
        console.log(pc.green("✔ Pipeline configuration is valid."));
        return;
      }

      console.error(pc.red("✖ Pipeline configuration is invalid:\n"));
      for (const error of errors) {
        console.error(pc.yellow(`  - ${error}`));
      }

      // --- Interactive Fixer Logic ---
      if (missingPermissions.length > 0) {
        console.log(pc.cyan("\nThis command can automatically add the missing permissions for you."));
        
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(pc.bold("Would you like to add these permissions to .claude/settings.json? (y/N) "), (answer) => {
          if (answer.toLowerCase() === 'y') {
            fixPermissions(projectRoot, missingPermissions);
          } else {
            console.log(pc.gray("Aborted. Please add permissions manually."));
          }
          rl.close();
        });
      }

    } catch (error: any) {
      console.error(pc.red(`Validation error: ${error.message}`));
      process.exit(1);
    }
  });

// Helper function to safely update settings.json
function fixPermissions(projectRoot: string, permissionsToAdd: string[]) {
    const settingsPath = path.join(projectRoot, ".claude", "settings.json");
    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        
        // Ensure the path to the 'allow' array exists
        if (!settings.permissions) settings.permissions = {};
        if (!settings.permissions.allow) settings.permissions.allow = [];

        // Use a Set to prevent duplicates
        const updatedPermissions = new Set([...settings.permissions.allow, ...permissionsToAdd]);
        settings.permissions.allow = [...updatedPermissions];

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log(pc.green("\n✔ Successfully updated .claude/settings.json."));
        console.log(pc.cyan("  Run 'claude-project validate' again to confirm."));

    } catch (e: any) {
        console.error(pc.red(`\nError updating settings.json: ${e.message}`));
        console.error(pc.gray("Please fix the file manually."));
    }
}

// ... (rest of the file)
```

### Step 3: Confirm the `run` Command Remains Non-Interactive

**Objective:** Ensure that the `run` command's silent validation does **not** become interactive.

**Task:** Review the `orchestrator.ts` file to confirm its behavior is still correct.

**File: `src/tools/orchestrator.ts` (Review - No Changes Needed)**
```typescript
// ...
export async function runTask(taskRelativePath: string) {
  const config = await getConfig();
  const projectRoot = getProjectRoot();

  // The `errors` array now contains the user-friendly permission error messages.
  // The `missingPermissions` array is simply ignored here, so no prompt occurs.
  // This logic remains perfectly correct for a non-interactive check.
  const { isValid, errors } = validatePipeline(config, projectRoot);
  if (!isValid) {
    console.error(pc.red("✖ Your pipeline configuration is invalid. Cannot run task.\n"));
    for (const error of errors) {
      console.error(pc.yellow(`  - ${error}`));
    }
    console.error(pc.cyan("\nPlease fix the errors or run 'claude-project validate' for details."));
    process.exit(1);
  }

  // ... rest of the function continues
}
```
This design is robust. The validator provides structured data, and each command (`validate` and `run`) uses that data in the way that is most appropriate for its context (interactive vs. non-interactive).