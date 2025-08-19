import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import { mergePackageJson } from "./utils/pkg.js";
import { handleExistingSettings } from "./init/settings-handler.js";

export async function init(targetRoot: string) {
  console.log(pc.cyan("Initializing CatHerder..."));

  // 1. Create the config file from the template
  const configTemplatePath = path.resolve(new URL("./templates/claude.config.js", import.meta.url).pathname);
  const targetConfigPath = path.join(targetRoot, "catherder.config.js");
  if (fs.existsSync(targetConfigPath)) {
    console.log(pc.yellow("catherder.config.js already exists, skipping."));
  } else {
    await fs.copy(configTemplatePath, targetConfigPath);
    console.log(pc.green("Created catherder.config.js"));
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
  const taskFolder = "catherder-Tasks";
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
      "claude:run": "catherder run",
      "claude:watch": "catherder watch",
      "claude:status": "catherder status",
      "claude:tui": "catherder tui",
      "claude:web": "catherder web",
    },
    devDependencies: {
      "@your-scope/catherder": "0.1.0",
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
