import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import { mergePackageJson } from "./utils/pkg.js";

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
  
  // 2. CRITICAL: Copy the .claude command templates
  const dotClaudeTemplatePath = path.resolve(new URL("./dot-claude", import.meta.url).pathname);
  const targetDotClaudePath = path.join(targetRoot, ".claude");
  // We use fs-extra's copy which works like `cp -r`
  await fs.copy(dotClaudeTemplatePath, targetDotClaudePath, {
      overwrite: false, // Don't overwrite if the user has customized their commands
      errorOnExist: false,
  });
  console.log(pc.green("Created .claude/commands directory with default commands."));


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
    },
  };

  await fs.writeJson(pkgPath, mergePackageJson(pkg, delta), { spaces: 2 });
  console.log(pc.green("Updated package.json with claude-project scripts."));
  console.log(pc.blue("\nInitialization complete!"));
  console.log(pc.blue("Run `npm install`, then `npm run claude:run claude-Tasks/task-001-sample.md`"));
}
