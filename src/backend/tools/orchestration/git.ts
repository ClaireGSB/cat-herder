import { execSync } from "node:child_process";
import pc from "picocolors";
import { ClaudeProjectConfig } from "../../config.js";
import { taskPathToTaskId } from "../../utils/id-generation.js";

/**
 * Converts a task file path into a Git-friendly branch name.
 * e.g., "claude-Tasks/sequence-A/01-sample.md" -> "claude/claude-Tasks-sequence-A-01-sample"
 * @param taskPath The path to the task file.
 * @param projectRoot The project root directory.
 */
export function taskPathToBranchName(taskPath: string, projectRoot: string): string {
  const taskId = taskPathToTaskId(taskPath, projectRoot);
  // remove the "task-" prefix for the branch name for brevity
  const branchNameSegment = taskId.startsWith('task-') ? taskId.substring(5) : taskId;
  return `claude/${branchNameSegment}`;
}

/**
 * Ensures the repository is on the correct branch for the given task,
 * respecting the user's configuration.
 * @param config The loaded project configuration.
 * @param projectRoot The absolute path to the project root.
 * @param taskPath The path to the task file.
 * @returns The name of the branch the task will run on.
 */
export function ensureCorrectGitBranch(config: ClaudeProjectConfig, projectRoot: string, taskPath: string): string {
  const currentBranch = execSync('git branch --show-current', { cwd: projectRoot }).toString().trim();

  // SCENARIO A: User has disabled automatic branch management.
  if (config.manageGitBranch === false) {
    console.log(pc.yellow("› Automatic branch management is disabled."));
    console.log(pc.yellow(`› Task will run on your current branch: "${currentBranch}"`));
    return currentBranch;
  }

  // SCENARIO B: Branch management is enabled (default behavior).
  const expectedBranch = taskPathToBranchName(taskPath, projectRoot);

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

/**
 * Ensures the repository is on the correct branch for a sequence,
 * creating it if necessary.
 */
export function ensureCorrectGitBranchForSequence(branchName: string, projectRoot: string): string {
  const currentBranch = execSync('git branch --show-current', { cwd: projectRoot }).toString().trim();

  if (currentBranch === branchName) {
    console.log(pc.cyan(`[Sequence] Resuming sequence on existing branch: "${branchName}"`));
    return branchName;
  }

  console.log(pc.cyan("[Sequence] Setting up Git environment..."));

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