

# Implementation Plan: Branch-Aware Task Resumption

### Goal

To refactor the Git setup logic to be fully aware of the current state, allowing for seamless resumption of partially completed or aborted tasks. The tool must intelligently handle cases where a task's branch already exists and may even be the currently active branch.

### Description

The current Git setup is too simplistic and fails in common resume scenarios. We will replace it with a more sophisticated function that follows a "state-aware" logic:

1.  **Check Task Status:** As implemented in the last step, the tool will first check if the overall task is marked as `done`. If so, it will exit.
2.  **Determine Expected Branch:** The orchestrator will calculate the branch name that corresponds to the task (e.g., `claude/task-001-sample`).
3.  **Check Current Branch:** The orchestrator will check what Git branch the user is *currently* on.
    *   **Scenario A: Already on the Correct Branch.** If the current branch matches the expected task branch, the tool will assume it's a "resume" operation. It will **skip** the "clean working directory" check and all `git checkout` commands, and proceed directly to running the pipeline steps.
    *   **Scenario B: On a Different Branch (e.g., `main`).** If the user is on any other branch, the tool will perform the full setup sequence: check for a clean working directory, sync the `main` branch, and then create or check out the task branch before proceeding.

This change elevates the tool from a simple script to a truly resilient assistant that supports the natural, often interrupted, workflow of a developer.

---

## Summary Checklist

-   [ ] **Step 1:** Replace `setupGitBranch` with the new, state-aware `ensureCorrectGitBranch` function.
-   [ ] **Step 2:** Integrate the new function into the `runTask` orchestrator.
-   [ ] **Step 3:** Update the `README.md` to highlight the new intelligent resume capability.

---

## Detailed Implementation Steps

### Step 1: Implement the New `ensureCorrectGitBranch` Function

**Objective:** Create a single, robust function that correctly handles both starting new tasks and resuming existing ones.

**Task:** In `src/tools/orchestrator.ts`, completely **replace** the old `setupGitBranch` function with this new `ensureCorrectGitBranch` function. The `taskPathToBranchName` helper remains the same.

**File: `src/tools/orchestrator.ts` (Updated Functions)**
```typescript
// ... (imports and taskPathToBranchName helper function remain the same) ...

/**
 * Ensures the repository is on the correct branch for the given task.
 * Intelligently handles starting new tasks vs. resuming existing ones.
 * @param projectRoot The absolute path to the project root.
 * @param taskPath The path to the task file.
 * @returns The name of the task's branch.
 */
function ensureCorrectGitBranch(projectRoot: string, taskPath: string): string {
  const expectedBranch = taskPathToBranchName(taskPath);
  const currentBranch = execSync('git branch --show-current', { cwd: projectRoot }).toString().trim();

  // SCENARIO A: We are already on the correct branch for the task.
  if (currentBranch === expectedBranch) {
    console.log(pc.cyan(`[Orchestrator] Resuming task on existing branch: "${expectedBranch}"`));
    // We do nothing else. We stay on the branch and proceed.
    return expectedBranch;
  }

  // SCENARIO B: We are on a different branch and need to set up.
  console.log(pc.cyan("[Orchestrator] Setting up Git environment..."));

  // 1. Safety Check: Abort if the current branch has uncommitted changes.
  const gitStatus = execSync('git status --porcelain', { cwd: projectRoot }).toString().trim();
  if (gitStatus) {
    throw new Error(`Git working directory on branch "${currentBranch}" is not clean. Please commit or stash your changes before starting a new task.`);
  }

  // 2. Check out the local main branch.
  console.log(pc.gray("  › Switching to main branch..."));
  try {
      execSync('git checkout main', { cwd: projectRoot, stdio: 'pipe' });
  } catch (e) {
      throw new Error("Could not check out 'main' branch. This tool requires a 'main' branch as the base.");
  }

  // 3. Detect remote and attempt to pull.
  try {
    execSync('git remote get-url origin', { cwd: projectRoot, stdio: 'pipe' });
    console.log(pc.gray("  › Remote 'origin' found. Syncing with remote..."));
    execSync('git pull origin main', { cwd: projectRoot, stdio: 'pipe', timeout: 5000 });
  } catch (err) {
    console.log(pc.yellow("  › No remote 'origin' found or pull failed. Proceeding with local 'main'."));
  }

  // 4. Create or check out the dedicated task branch.
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
```

### Step 2: Integrate the New Function into `runTask`

**Objective:** Update the main `runTask` function to call our new, smarter Git function.

**Task:** In `src/tools/orchestrator.ts`, find the line that calls `setupGitBranch` and change it to `ensureCorrectGitBranch`.

**File: `src/tools/orchestrator.ts` (Updated `runTask`)**
```typescript
// ... (imports) ...

export async function runTask(taskRelativePath: string) {
  // ... (status check logic remains the same) ...
  
  // Replace the old function call with the new one.
  const branchName = ensureCorrectGitBranch(projectRoot, taskRelativePath);
  
  // The log message is now conditional, so we can remove it from here.
  // console.log(pc.cyan(`[Orchestrator] Task will be executed on branch: ${branchName}`));

  // ... (rest of the function remains the same) ...
}
```

### Step 3: Update README.md

**Objective:** Let users know that the tool is now smart enough to resume their work.

**Task:** Update the "Isolated Git Branches" section in `README.md`.

**File: `README.md` (Updated Section)**
```markdown
### Isolated and Resumable Git Branches

To ensure safety and a clean Git history, the orchestrator automatically manages branches for you. When you run a task:

1.  It first checks if the task is already complete. If so, it exits.
2.  It then checks your current branch. **If you are already on the correct branch for the task, it seamlessly resumes the work from where it left off.**
3.  If you are on a different branch, it checks for uncommitted changes, syncs with your `main` branch, and then creates or checks out a unique, dedicated branch for the task (e.g., `claude/my-new-feature`).
4.  All commits generated by the AI are made to this task branch.

This system keeps your `main` branch clean and isolates all automated work, while intelligently supporting a natural workflow of starting, stopping, and resuming tasks.
