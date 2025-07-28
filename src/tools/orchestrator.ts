import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { runStreaming } from "./proc.js";
import { updateStatus, readStatus, TaskStatus } from "./status.js";
import { getConfig, getProjectRoot } from "../config.js";
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
 * Sets up the Git environment for a task run, handling both local and remote repos.
 * @param projectRoot The absolute path to the project root.
 * @param taskPath The path to the task file.
 * @returns The name of the created or checked-out branch.
 */
function setupGitBranch(projectRoot: string, taskPath: string): string {
  console.log(pc.cyan("[Orchestrator] Setting up Git environment..."));

  // 1. Safety Check: Abort if there are uncommitted changes.
  const gitStatus = execSync('git status --porcelain', { cwd: projectRoot }).toString().trim();
  if (gitStatus) {
    throw new Error("Git working directory is not clean. Please commit or stash your changes before starting a new task.");
  }

  // 2. Check out the local main branch.
  console.log(pc.gray("  › Switching to main branch..."));
  try {
      execSync('git checkout main', { cwd: projectRoot, stdio: 'pipe' });
  } catch (e) {
      throw new Error("Could not check out 'main' branch. Does it exist? This tool currently requires a 'main' branch as the base for new work.");
  }

  // 3. Detect remote and attempt to pull.
  try {
    // This command will fail if 'origin' does not exist, moving to the catch block.
    execSync('git remote get-url origin', { cwd: projectRoot, stdio: 'pipe' });
    console.log(pc.gray("  › Remote 'origin' found. Syncing with remote..."));
    try {
      // Add a timeout in case of network issues.
      execSync('git pull origin main', { cwd: projectRoot, stdio: 'pipe', timeout: 5000 });
    } catch (pullError) {
      console.warn(pc.yellow("  ! Warning: Could not pull from 'origin/main'. Proceeding with local version. Please check your network connection and Git credentials."));
    }
  } catch (remoteError) {
    console.log(pc.yellow("  › No remote 'origin' found. Proceeding with local 'main' branch."));
  }

  // 4. Create or check out the dedicated task branch.
  const branchName = taskPathToBranchName(taskPath);
  const existingBranches = execSync(`git branch --list ${branchName}`, { cwd: projectRoot }).toString().trim();

  if (existingBranches) {
    console.log(pc.yellow(`  › Branch "${branchName}" already exists. Checking it out.`));
    execSync(`git checkout ${branchName}`, { cwd: projectRoot, stdio: 'pipe' });
  } else {
    console.log(pc.green(`  › Creating and checking out new branch: "${branchName}"`));
    execSync(`git checkout -b ${branchName}`, { cwd: projectRoot, stdio: 'pipe' });
  }
  
  return branchName;
}

async function executeStep(
  name: string,
  command: string,
  fullPrompt: string,
  statusFile: string,
  logFile: string,
  check: CheckConfig
) {
  const projectRoot = getProjectRoot();
  console.log(pc.blue(`\n[Orchestrator] Starting step: ${name}`));
  updateStatus(statusFile, s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });

  const { code } = await runStreaming("claude", [`/project:${command}`], logFile, projectRoot, fullPrompt);
  if (code !== 0) {
    updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
    throw new Error(`Step "${name}" failed. Check log for details: ${logFile}`);
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

  // --- NEW GIT WORKFLOW INTEGRATION ---
  // This is now the first action of any run.
  const branchName = setupGitBranch(projectRoot, taskRelativePath);
  console.log(pc.cyan(`[Orchestrator] Task will be executed on branch: ${branchName}`));
  // --- END OF NEW SECTION ---

  // --- IMPLICIT VALIDATION STEP (Step 5) ---
  const { isValid, errors } = validatePipeline(config, projectRoot);
  if (!isValid) {
    console.error(pc.red("✖ Your pipeline configuration is invalid. Cannot run task.\n"));
    for (const error of errors) console.error(pc.yellow(`  - ${error}`));
    console.error(pc.cyan("\nPlease fix the errors in 'claude.config.js' or run 'claude-project validate' for details."));
    process.exit(1);
  }

  console.log(pc.cyan(`Project root identified: ${projectRoot}`));

  const taskId = path.basename(taskRelativePath, '.md').replace(/[^a-z0-9-]/gi, '-');
  const statusFile = path.resolve(projectRoot, config.statePath, `${taskId}.state.json`);
  const logsDir = path.resolve(projectRoot, config.logsPath, taskId);
  mkdirSync(logsDir, { recursive: true });

  const status: TaskStatus = readStatus(statusFile);
  updateStatus(statusFile, s => { if (s.taskId === 'unknown') s.taskId = taskId; });

  const taskContent = readFileSync(path.resolve(projectRoot, taskRelativePath), 'utf-8');

  for (const [index, stepConfig] of config.pipeline.entries()) {
    const { name, command, context: contextKeys, check } = stepConfig;

    if (status.steps[name] === 'done') {
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

    await executeStep(name, command, fullPrompt, statusFile, logFile, check);
  }

  updateStatus(statusFile, s => { s.phase = 'done'; });
  console.log(pc.green("\n[Orchestrator] All steps completed successfully!"));
}