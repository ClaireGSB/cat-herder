

# PLAN.md

## Title & Goal

**Title:** Safely Merge Hooks into Existing `.claude/settings.json`

**Goal:** To ensure the pipeline validation hook is present in `settings.json` after running `init`, even if the file already exists, by prompting the user for permission to merge it.

## Description

Currently, the `claude-project init` command completely skips writing to `.claude/settings.json` if it already exists. This can cause problems for users with older or custom configurations who might be missing the critical `PreToolUse` hook. Without this hook, the `fileAccess` guardrails defined in `claude.config.js` will not be enforced, defeating a key safety feature of the tool.

This change modifies the `init` command's behavior. Now, if `settings.json` exists, the command will read and parse it. If the required validation hook is missing, it will inform the user why the hook is needed and interactively ask for permission to add it. This ensures functionality without destructively overwriting the user's custom settings.

## Summary Checklist

- [ ] Modify the `init` command to inspect `settings.json` if it exists.
- [ ] Implement logic to parse the `settings.json` and check for the validation hook.
- [ ] Add a user prompt using Node's `readline` module to ask for permission.
- [ ] Implement a non-destructive merge function to add the hook to the JSON object.
- [ ] Write the updated configuration back to the file if the user agrees.
- [ ] Update the `README.md` to document this new, safer behavior.

## Detailed Implementation Steps

### 1. Update `init.ts` to Check Existing `settings.json`

*   **Objective:** Change the `init` command to intelligently handle an existing `.claude/settings.json` file instead of simply skipping it.
*   **Task:** Modify the `init` function in `src/init.ts`. After copying the template files, add a new function call that specifically processes the `settings.json` file.

    ```typescript
    // src/init.ts

    // ... after fs.copy for the .claude directory ...
    
    // Add this new function call
    await handleExistingSettings(targetDotClaudePath, dotClaudeTemplatePath);
    
    console.log(pc.green("Created .claude/ directory with default commands and settings."));
    // ... rest of the init function ...
    ```

### 2. Implement Hook Checking and Merging Logic

*   **Objective:** Create functions to check if the hook exists and to merge it into the configuration without overwriting existing user settings.
*   **Task:** In `src/init.ts`, create the `handleExistingSettings` function and its helpers. This function will read both the template `settings.json` and the user's existing `settings.json` to perform the check and merge.

*   **Code Snippets (New Functions in `src/init.ts`):**

    ```typescript
    // src/init.ts
    import readline from "readline"; // Add this import at the top

    // Define the hook we need to ensure exists
    const requiredHook = {
      type: "command",
      command: "node ./node_modules/@your-scope/claude-project/dist/tools/pipeline-validator.js < /dev/stdin",
    };
    
    const requiredMatcher = "Edit|Write|MultiEdit";

    /**
     * Checks if the validation hook exists and adds it if missing.
     */
    async function handleExistingSettings(targetDir: string, templateDir: string) {
      const targetSettingsPath = path.join(targetDir, 'settings.json');
      
      // If the user doesn't have a settings.json, copy the default one and finish.
      if (!fs.existsSync(targetSettingsPath)) {
        const templateSettingsPath = path.join(templateDir, 'settings.json');
        await fs.copy(templateSettingsPath, targetSettingsPath);
        return;
      }

      // If the file exists, read and check it.
      const userSettings = await fs.readJson(targetSettingsPath);

      if (doesHookExist(userSettings)) {
        console.log(pc.gray("Validation hook already present in .claude/settings.json."));
        return;
      }

      // If hook is missing, call the interactive prompt function
      await promptToAddHook(targetSettingsPath, userSettings);
    }

    /**
     * Checks if the required hook is present in the settings object.
     */
    function doesHookExist(settings: any): boolean {
      const preToolUseHooks = settings?.hooks?.PreToolUse;
      if (!Array.isArray(preToolUseHooks)) return false;

      const matcherEntry = preToolUseHooks.find(h => h.matcher === requiredMatcher);
      if (!matcherEntry || !Array.isArray(matcherEntry.hooks)) return false;
      
      return matcherEntry.hooks.some((h: any) => h.command === requiredHook.command);
    }
    
    /**
     * Merges the required hook into the settings object non-destructively.
     */
    function mergeHook(settings: any): any {
      const newSettings = JSON.parse(JSON.stringify(settings)); // Deep copy

      if (!newSettings.hooks) newSettings.hooks = {};
      if (!newSettings.hooks.PreToolUse) newSettings.hooks.PreToolUse = [];
      
      let matcherEntry = newSettings.hooks.PreToolUse.find((h: any) => h.matcher === requiredMatcher);

      if (matcherEntry) {
        if (!matcherEntry.hooks) matcherEntry.hooks = [];
        matcherEntry.hooks.push(requiredHook);
      } else {
        newSettings.hooks.PreToolUse.push({
          matcher: requiredMatcher,
          hooks: [requiredHook],
        });
      }
      return newSettings;
    }
    ```

### 3. Implement the Interactive User Prompt

*   **Objective:** Ask for the user's consent before modifying their configuration file, clearly explaining the reason.
*   **Task:** Create a `promptToAddHook` function in `src/init.ts` that uses Node's `readline` module.

*   **Code Snippet (New Function in `src/init.ts`):**

    ```typescript
    // src/init.ts

    /**
     * Prompts the user to add the missing hook.
     */
    function promptToAddHook(settingsPath: string, userSettings: any): Promise<void> {
      return new Promise((resolve) => {
        console.log(pc.yellow("\nWarning: Your .claude/settings.json is missing a required validation hook."));
        console.log(pc.gray("This hook enables the file access guardrails defined in your pipeline."));
        console.log(pc.gray(`It will be added to the 'PreToolUse' section.`));

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        
        rl.question(pc.cyan("Do you want to add it automatically? (Y/n) "), async (answer) => {
          rl.close();
          if (answer.toLowerCase() === 'y' || answer === '') {
            const updatedSettings = mergeHook(userSettings);
            await fs.writeJson(settingsPath, updatedSettings, { spaces: 2 });
            console.log(pc.green("✔ Hook successfully added to .claude/settings.json."));
          } else {
            console.log(pc.yellow("Skipping hook addition. File access guardrails will be disabled."));
          }
          resolve();
        });
      });
    }
    ```
    
## Error Handling & Warnings

*   **Invalid `settings.json`:** If `.claude/settings.json` exists but contains invalid JSON, `fs.readJson` will throw an error. The `init` command should catch this and display a helpful message:
    > `Error: Could not parse .claude/settings.json. Please fix or remove the file and run 'init' again.`

*   **User Declines:** If the user chooses "n", the tool should print a clear warning:
    > `Skipping hook addition. File access guardrails will be disabled.`

*   **File Permissions:** If writing the updated `settings.json` fails (e.g., due to file permissions), the `fs.writeJson` error should be caught and reported to the user.

## Documentation Changes

The final step is to update the documentation to reflect this new, safer behavior.

*   **Objective:** Ensure the `README.md` accurately describes how `init` handles an existing `settings.json`.
*   **Task:** In `README.md`, find the section "Permissions and Security (`.claude/settings.json`)".
*   **Change:**
    *   **FROM:** `**Important:** If you have an existing `.claude/settings.json` file, the `init` command **will not overwrite it**, preserving your custom configuration.`
    *   **TO (suggestion):** `**Important:** If you have an existing `.claude/settings.json` file, the `init` command **will not overwrite it**. Instead, it will check if the necessary validation hooks are present. If they are missing, it will prompt you to add them, ensuring that security features like `fileAccess` work correctly while preserving your custom settings.`

