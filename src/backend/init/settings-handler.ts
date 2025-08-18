import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import readline from "readline";

// Define the hook we need to ensure exists
const requiredHook = {
  type: "command",
  command: "node ./node_modules/@your-scope/claude-project/dist/tools/pipeline-validator.js < /dev/stdin",
};

const requiredMatcher = "Edit|Write|MultiEdit";

/**
 * Checks if the validation hook exists and adds it if missing.
 */
export async function handleExistingSettings(targetDir: string, templateDir: string) {
  const targetSettingsPath = path.join(targetDir, 'settings.json');
  
  // If the user doesn't have a settings.json, copy the default one and finish.
  if (!fs.existsSync(targetSettingsPath)) {
    const templateSettingsPath = path.join(templateDir, 'settings.json');
    await fs.copy(templateSettingsPath, targetSettingsPath);
    return;
  }

  // If the file exists, read and check it.
  try {
    const userSettings = await fs.readJson(targetSettingsPath);

    if (doesHookExist(userSettings)) {
      console.log(pc.gray("Validation hook already present in .claude/settings.json."));
      return;
    }

    // If hook is missing, call the interactive prompt function
    await promptToAddHook(targetSettingsPath, userSettings);
  } catch (error) {
    console.error(pc.red("Error: Could not parse .claude/settings.json. Please fix or remove the file and run 'init' again."));
    process.exit(1);
  }
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
        try {
          const updatedSettings = mergeHook(userSettings);
          await fs.writeJson(settingsPath, updatedSettings, { spaces: 2 });
          console.log(pc.green("✔ Hook successfully added to .claude/settings.json."));
        } catch (error) {
          console.error(pc.red(`Error writing to .claude/settings.json: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      } else {
        console.log(pc.yellow("Skipping hook addition. File access guardrails will be disabled."));
      }
      resolve();
    });
  });
}