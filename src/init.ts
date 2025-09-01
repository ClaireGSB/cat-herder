import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import { mergePackageJson } from "./utils/pkg.js";
import readline from "node:readline";
import { handleExistingSettings } from "./init/settings-handler.js";

async function askProvider(): Promise<'claude' | 'codex'> {
  // 1) Env override for non-interactive/test environments
  const envChoice = (process.env.CAT_HERDER_AI_PROVIDER || '').trim().toLowerCase();
  if (envChoice === 'claude' || envChoice === 'codex') {
    return envChoice as 'claude' | 'codex';
  }
  // 2) Default to claude if not running in a TTY (e.g., tests/CI)
  const isTTY = process.stdin.isTTY;
  if (!isTTY || process.env.CI) {
    console.log(pc.gray("No TTY detected; defaulting aiProvider to 'claude'. Set CAT_HERDER_AI_PROVIDER to override."));
    return 'claude';
  }
  // 3) Interactive prompt
  return await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Which AI provider do you want to use? (claude/codex) [claude]: ", (answer) => {
      rl.close();
      const a = (answer || '').trim().toLowerCase();
      if (a === 'codex') return resolve('codex');
      return resolve('claude');
    });
  });
}

export async function init(targetRoot: string) {
  console.log(pc.cyan("Initializing cat-herder..."));

  // Ask user which provider they want
  const chosenProvider = await askProvider();

  // 1. Create the config file from the template
  const configTemplatePath = path.resolve(new URL("./templates/cat-herder.config.js", import.meta.url).pathname);
  const targetConfigPath = path.join(targetRoot, "cat-herder.config.js");
  if (fs.existsSync(targetConfigPath)) {
    console.log(pc.yellow("cat-herder.config.js already exists, skipping."));
  } else {
    await fs.copy(configTemplatePath, targetConfigPath);
    try {
      // Inject aiProvider into the generated config
      const orig = await fs.readFile(targetConfigPath, 'utf-8');
      const updated = orig.replace(
        /module\.exports\s*=\s*\{/, 
        match => `${match}\n  aiProvider: '${chosenProvider}',`
      );
      await fs.writeFile(targetConfigPath, updated, 'utf-8');
      console.log(pc.green(`Created cat-herder.config.js (aiProvider: ${chosenProvider})`));
    } catch {
      console.log(pc.yellow("Created cat-herder.config.js (could not inject aiProvider automatically)"));
    }
  }
  
  // 2. Create neutral steps directory from templates
  const stepsTemplatePath = path.resolve(new URL("./templates/steps", import.meta.url).pathname);
  const targetStepsPath = path.join(targetRoot, ".cat-herder", "steps");
  await fs.copy(stepsTemplatePath, targetStepsPath, { overwrite: false, errorOnExist: false });
  console.log(pc.green("Created .cat-herder/steps directory with default prompts."));

  // 3. Copy the .claude settings (Claude only)
  if (chosenProvider === 'claude') {
    const dotClaudeTemplatePath = path.resolve(new URL("./dot-claude", import.meta.url).pathname);
    const targetDotClaudePath = path.join(targetRoot, ".claude");
    await fs.ensureDir(targetDotClaudePath);
    // Only copy settings.json (commands are now in .cat-herder/steps)
    await fs.copy(path.join(dotClaudeTemplatePath, 'settings.json'), path.join(targetDotClaudePath, 'settings.json'), { overwrite: false, errorOnExist: false });
    await handleExistingSettings(targetDotClaudePath, dotClaudeTemplatePath);
    console.log(pc.green("Created .claude/settings.json with default permissions and hooks."));
  } else {
    console.log(pc.yellow("Skipping .claude settings setup because provider is 'codex'."));
  }

  // 4. Create a sample task and folder
  const taskFolder = "cat-herder-tasks";
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
      "cat-herder:run": "cat-herder run",
      "cat-herder:watch": "cat-herder watch",
      "cat-herder:status": "cat-herder status",
      "cat-herder:tui": "cat-herder tui",
      "cat-herder:web": "cat-herder web",
    },
    devDependencies: {
      "@your-scope/cat-herder": "0.1.0",
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
