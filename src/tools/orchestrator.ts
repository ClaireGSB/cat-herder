import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { runStreaming } from "./proc.js";
import { updateStatus, readStatus, TaskStatus } from "./status.js";
import { getConfig, getProjectRoot, ClaudeProjectConfig } from "../config.js";
import { runCheck, CheckConfig } from "./check-runner.js";
import { contextProviders } from "./providers.js";
import { validatePipeline } from "./validator.js";

/**
 * Converts a task file path into a Git-friendly branch name.
 * e.g., "claude-Tasks/01-sample.md" -> "claude/01-sample"
 * @param taskPath The path to the task file.
 */
function taskPathToBranchName(taskPath: string): string {
  const taskFileName = path.basename(taskPath, '.md');
  const sanitized = taskFileName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
  return `claude/${sanitized}`;
}

/**
 * Ensures the repository is on the correct branch for the given task,
 * respecting the user's configuration.
 * @param config The loaded project configuration.
 * @param projectRoot The absolute path to the project root.
 * @param taskPath The path to the task file.
 * @returns The name of the branch the task will run on.
 */
function ensureCorrectGitBranch(config: ClaudeProjectConfig, projectRoot: string, taskPath: string): string {
  const currentBranch = execSync('git branch --show-current', { cwd: projectRoot }).toString().trim();

  // SCENARIO A: User has disabled automatic branch management.
  if (config.manageGitBranch === false) {
    console.log(pc.yellow("› Automatic branch management is disabled."));
    console.log(pc.yellow(`› Task will run on your current branch: "${currentBranch}"`));
    return currentBranch;
  }

  // SCENARIO B: Branch management is enabled (default behavior).
  const expectedBranch = taskPathToBranchName(taskPath);

  if (currentBranch === expectedBranch) {
    console.log(pc.cyan(`[Orchestrator] Resuming task on existing branch: "${expectedBranch}"`));
    return expectedBranch;
  }

  console.log(pc.cyan("[Orchestrator] Setting up Git environment..."));

  const gitStatus = execSync('git status --porcelain', { cwd: projectRoot }).toString().trim();
  if (gitStatus) {
    throw new Error(`Git working directory on branch "${currentBranch}" is not clean. Please commit or stash your changes.`);
  }

  console.log(pc.gray("  › Switching to main branch..."));
  try {
    execSync('git checkout main', { cwd: projectRoot, stdio: 'pipe' });
  } catch (e) {
    throw new Error("Could not check out 'main' branch. A 'main' branch is required for automated branch management.");
  }

  try {
    execSync('git remote get-url origin', { cwd: projectRoot, stdio: 'pipe' });
    console.log(pc.gray("  › Remote 'origin' found. Syncing..."));
    execSync('git pull origin main', { cwd: projectRoot, stdio: 'pipe', timeout: 5000 });
  } catch (err) {
    console.log(pc.yellow("  › No remote 'origin' found or pull failed. Proceeding with local 'main'."));
  }

  const existingBranches = execSync(`git branch --list ${expectedBranch}`, { cwd: projectRoot }).toString().trim();
  if (existingBranches) {
    console.log(pc.yellow(`  › Branch "${expectedBranch}" already exists. Checking it out.`));
    execSync(`git checkout ${expectedBranch}`, { cwd: projectRoot, stdio: 'pipe' });
  } else {
    console.log(pc.green(`  › Creating and checking out new branch: "${expectedBranch}"`));
    execSync(`git checkout -b ${expectedBranch}`, { cwd: projectRoot, stdio: 'pipe' });
  }
  
  return expectedBranch;
}

async function executeStep(
  name: string,
  command: string,
  fullPrompt: string,
  statusFile: string,
  logFile: string,
  thoughtsLogFile: string,
  check: CheckConfig
) {
  const projectRoot = getProjectRoot();
  console.log(pc.blue(`\n[Orchestrator] Starting step: ${name}`));
  updateStatus(statusFile, s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });

  const { code } = await runStreaming("claude", [`/project:${command}`], logFile, projectRoot, fullPrompt, thoughtsLogFile);
  if (code !== 0) {
    updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
    throw new Error(`Step "${name}" failed. Check the output log for details: ${logFile}\nAnd the chain of thought log: ${thoughtsLogFile}`);
  }

  await runCheck(check, projectRoot);

  console.log(`[Orchestrator] Committing checkpoint for step: ${name}`);
  execSync(`git add -A`, { stdio: "inherit", cwd: projectRoot });
  execSync(`git commit -m "chore(${name}): checkpoint"`, { stdio: "inherit", cwd: projectRoot });
  updateStatus(statusFile, s => { s.phase = "pending"; s.steps[name] = "done"; });
}

export async function runTask(taskRelativePath: string) {
  const config = await getConfig();
  if (!config) {
    throw new Error("Failed to load configuration.");
  }
  const projectRoot = getProjectRoot();
  console.log(pc.cyan(`Project root identified: ${projectRoot}`));

  // 1. Determine paths and check status FIRST.
  const taskId = path.basename(taskRelativePath, '.md').replace(/[^a-z0-9-]/gi, '-');
  const statusFile = path.resolve(projectRoot, config.statePath, `${taskId}.state.json`);
  mkdirSync(path.dirname(statusFile), { recursive: true });
  const status: TaskStatus = readStatus(statusFile);

  if (status.phase === 'done') {
    console.log(pc.green(`✔ Task "${taskId}" is already complete.`));
    console.log(pc.gray("  › To re-run, delete the state file and associated branch."));
    return;
  }

  // 2. Validate the pipeline configuration.
  const { isValid, errors } = validatePipeline(config, projectRoot);
  if (!isValid) {
    console.error(pc.red("✖ Pipeline configuration is invalid. Cannot run task.\n"));
    for (const error of errors) console.error(pc.yellow(`  - ${error}`));
    console.error(pc.cyan("\nPlease fix the errors or run 'claude-project validate' for details."));
    process.exit(1);
  }

  // 3. Ensure we are on the correct Git branch (now respects the user's config).
  const branchName = ensureCorrectGitBranch(config, projectRoot, taskRelativePath);

  // 4. Proceed with execution.
  updateStatus(statusFile, s => {
    if (s.taskId === 'unknown') s.taskId = taskId;
    s.branch = branchName;
  });

  const logsDir = path.resolve(projectRoot, config.logsPath, taskId);
  mkdirSync(logsDir, { recursive: true });
  const taskContent = readFileSync(path.resolve(projectRoot, taskRelativePath), 'utf-8');

  for (const [index, stepConfig] of config.pipeline.entries()) {
    const { name, command, context: contextKeys, check } = stepConfig;
    const currentStepStatus = readStatus(statusFile);
    if (currentStepStatus.steps[name] === 'done') {
      console.log(pc.gray(`[Orchestrator] Skipping '${name}' (already done).`));
      continue;
    }
    const context: Record<string, string> = {};
    for (const key of contextKeys) {
      context[key] = contextProviders[key](projectRoot, taskContent);
    }

    const commandFilePath = path.resolve(projectRoot, '.claude', 'commands', `${command}.md`);
    const commandInstructions = readFileSync(commandFilePath, 'utf-8');
    let fullPrompt = "";
    for (const [title, content] of Object.entries(context)) {
      fullPrompt += `--- ${title.toUpperCase()} ---\n\`\`\`\n${content.trim()}\n\`\`\`\n\n`;
    }
    fullPrompt += `--- YOUR INSTRUCTIONS ---\n${commandInstructions}`;

    const logFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.log`);
    const thoughtsLogFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.thoughts.log`);
    await executeStep(name, command, fullPrompt, statusFile, logFile, thoughtsLogFile, check);
  }

  updateStatus(statusFile, s => { s.phase = 'done'; });
  console.log(pc.green("\n[Orchestrator] All steps completed successfully!"));
}