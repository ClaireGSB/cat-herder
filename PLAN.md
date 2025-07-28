
# Implementation Plan: Robust Git Workflow (V2)

### Goal

To integrate a safe, automated Git branching strategy that works seamlessly for **both local-only and remote-connected** Git repositories. This will isolate AI-generated work without making assumptions about the user's hosting setup.

### Description

We will refactor the `setupGitBranch` function to be more intelligent and resilient. The new sequence will be:
1.  **Safety Check:** Verify the working directory is clean.
2.  **Checkout `main`:** Switch to the local `main` branch.
3.  **Detect Remote:** Check if a remote named `origin` exists.
4.  **Conditional Pull:** If `origin` exists, *then* attempt to `git pull` the latest changes, with a graceful fallback if the pull fails due to network or auth issues.
5.  **Create Task Branch:** Proceed to create or check out the dedicated task branch.

This ensures the tool "just works" for all users, providing helpful feedback instead of crashing.

---

## Summary Checklist

-   [x] **Step 1:** Implement the new, robust `setupGitBranch` function.
-   [ ] **Step 2:** Integrate the function into the `runTask` orchestrator.
-   [ ] **Step 3:** Update documentation to clarify the behavior.

---

## Detailed Implementation Steps

### Step 1: Implement the New `setupGitBranch` Function

**Objective:** Replace the previous brittle function with a new version that intelligently handles the presence of a remote repository.

**Task:** Replace the existing `taskPathToBranchName` and `setupGitBranch` functions in `src/tools/orchestrator.ts` with these new, improved versions.

**File: `src/tools/orchestrator.ts` (Updated Functions)**
```typescript
// Add this import at the top
import { execSync } from "node:child_process";
// ... other imports

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
```

### Step 2: Integrate Git Setup into `runTask`

**Objective:** This step should already be complete from the previous plan, but it is included here for completeness. Confirm that `setupGitBranch` is the first action in `runTask`.

**Task:** Review the `runTask` function in `src/tools/orchestrator.ts`.

**File: `src/tools/orchestrator.ts` (Review `runTask`)**
```typescript
// ... imports and helper functions ...

export async function runTask(taskRelativePath: string) {
  const config = await getConfig();
  const projectRoot = getProjectRoot();

  // This should be the very first action of the run.
  const branchName = setupGitBranch(projectRoot, taskRelativePath);
  console.log(pc.cyan(`[Orchestrator] Task will be executed on branch: ${branchName}`));

  // ... (rest of the function continues as before)
}
```

### Step 3: Update README.md

**Objective:** Your documentation should reflect the tool's robustness and clarify the behavior for both local and remote repositories.

**Task:** Update the "Isolated Git Branches" section in `README.md`.

**File: `README.md` (Updated Section)**
```markdown
### Isolated Git Branches

To ensure safety and a clean Git history, the orchestrator automatically manages branches for you. When you run a task:

1.  It first checks that your repository has no uncommitted changes.
2.  It switches to your local `main` branch. If you have a remote repository named `origin`, it attempts to pull the latest changes to ensure you're up to date. (If you have a local-only repository, it safely skips this step).
3.  It then creates a unique, dedicated branch for the task (e.g., `claude/my-new-feature`).
4.  All commits generated by the AI during the pipeline are made to this task branch.

This keeps your `main` branch clean and isolates all automated work, whether you are working locally or with a remote team.
