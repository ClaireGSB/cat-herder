import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import readline from "readline";
import { mergePackageJson } from "./utils/pkg.js";

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

export async function init(targetRoot: string) {
  console.log(pc.cyan("Initializing claude-project..."));

  // 1. Create the config file from the template
  const configTemplatePath = path.resolve(new URL("./templates/claude.config.js", import.meta.url).pathname);
  const targetConfigPath = path.join(targetRoot, "claude.config.js");
  if (fs.existsSync(targetConfigPath)) {
    console.log(pc.yellow("claude.config.js already exists, skipping."));
  } else {
    await fs.copy(configTemplatePath, targetConfigPath);
    console.log(pc.green("Created claude.config.js"));
  }
  
  // 2. Copy the .claude command templates
  const dotClaudeTemplatePath = path.resolve(new URL("./dot-claude", import.meta.url).pathname);
  const targetDotClaudePath = path.join(targetRoot, ".claude");
  await fs.copy(dotClaudeTemplatePath, targetDotClaudePath, {
      overwrite: false,
      errorOnExist: false,
  });
  
  // Add this new function call to handle existing settings
  await handleExistingSettings(targetDotClaudePath, dotClaudeTemplatePath);
  
  console.log(pc.green("Created .claude/ directory with default commands and settings."));

  // 3. Create a sample task and folder
  const taskFolder = "claude-Tasks";
  await fs.ensureDir(path.join(targetRoot, taskFolder));
  const sampleTaskTemplatePath = path.resolve(new URL("./tasks/sample.md", import.meta.url).pathname);
  const sampleTaskTargetPath = path.join(targetRoot, taskFolder, "task-001-sample.md");
    if (fs.existsSync(sampleTaskTargetPath)) {
    console.log(pc.yellow("Sample task already exists, skipping."));
  } else {
    await fs.copy(sampleTaskTemplatePath, sampleTaskTargetPath);
    console.log(pc.green(`Created ${sampleTaskTargetPath}`));
  }

  // 4. Merge scripts and devDependencies
  const pkgPath = path.join(targetRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
      console.error(pc.red("Error: package.json not found in the current directory."));
      process.exit(1);
  }
  const pkg = await fs.readJson(pkgPath);

  const delta = {
    scripts: {
      "claude:run": "claude-project run",
      "claude:watch": "claude-project watch",
      "claude:status": "claude-project status",
      "claude:tui": "claude-project tui",
      "claude:web": "claude-project web",
    },
    devDependencies: {
      "@your-scope/claude-project": "0.1.0",
      "vitest": "^1.6.0",
      "@vitest/coverage-v8": "^1.6.0",
      "prettier": "^3.6.2",
    },
  };

  await fs.writeJson(pkgPath, mergePackageJson(pkg, delta), { spaces: 2 });
  console.log(pc.green("Updated package.json with scripts and dev dependencies."));
  console.log(pc.blue("\nInitialization complete!"));
  console.log(pc.blue("Run `npm install` to set up your project."));
}
