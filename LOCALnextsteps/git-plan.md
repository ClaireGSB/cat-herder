Excellent. This is the right way to build a complex tool: perfect the core, simple workflow first, and then document the vision for the more advanced features.

Here is a complete summary of how to implement the robust "Workflow 1" now, followed by a clear description for your V2 planning.

---

### Part 1: Implementation Summary for Workflow 1 (Independent Tasks)

The goal is to enforce a safe, repeatable Git workflow where every task starts from an up-to-date `main` branch and operates in isolation.

#### **Step 1: Create Git and State Helper Functions**

First, we will add two new helper functions to the top of `src/files/tools/orchestrator.ts`. We will also need to import the `path` module.

```typescript
// Add this import at the top of src/files/tools/orchestrator.ts
import path from "node:path";

// New helper to create a clean branch name from a file path
function taskPathToBranchName(taskPath: string): string {
  const taskFileName = path.basename(taskPath, '.md');
  const sanitized = taskFileName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `claude/${sanitized}`;
}

// New function to set up and enforce the Git workflow
function setupGitBranch(taskPath: string): { branchName: string; statusFile: string } {
  console.log("[Orchestrator] Setting up Git environment...");

  // 1. Safety Check: Abort if there are uncommitted changes
  const gitStatus = execSync('git status --porcelain').toString().trim();
  if (gitStatus) {
    throw new Error("Git working directory is not clean. Please commit or stash your changes before starting a new task.");
  }

  // 2. Sync with main branch to ensure we start from the latest source of truth
  console.log("[Orchestrator] Syncing with the main branch...");
  execSync('git fetch origin');
  execSync('git checkout main');
  execSync('git pull origin main');

  // 3. Create a unique branch for this task
  const branchName = taskPathToBranchName(taskPath);
  const statusFile = `state/${branchName.replace(/\//g, '-')}.state.json`;

  // Check if branch already exists to allow resuming
  if (execSync(`git branch --list ${branchName}`).toString().trim()) {
    console.log(`[Orchestrator] Branch '${branchName}' already exists. Checking it out.`);
    execSync(`git checkout ${branchName}`);
  } else {
    console.log(`[Orchestrator] Creating and checking out new branch: '${branchName}'`);
    execSync(`git checkout -b ${branchName}`);
  }
  
  return { branchName, statusFile };
}
```

#### **Step 2: Update the `step` and `updateStatus` Functions**

The `step` function needs to accept the dynamic `statusFile` path. For consistency, `updateStatus` should also be modified to initialize the `taskId` and `branch` fields in the state file.

```typescript
// In src/files/tools/status.ts
export function updateStatus(file: string, mut: (s: TaskStatus) => void, initialInfo?: { taskId: string, branch: string }) {
  let s: TaskStatus = readStatus(file);
  // If the taskId is unknown, this is the first update for this task state.
  if (s.taskId === 'unknown' && initialInfo) {
    s.taskId = initialInfo.taskId;
    s.branch = initialInfo.branch;
  }
  mut(s);
  s.lastUpdate = new Date().toISOString();
  writeJsonAtomic(file, s);
}

// In src/files/tools/orchestrator.ts
async function step(name: string, args: string[], log: string, check: () => void | Promise<void>, statusFile: string, initialInfo?: { taskId: string, branch: string }) {
  console.log(`\n[Orchestrator] Starting step: ${name}`);
  updateStatus(statusFile, s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; }, initialInfo);

  // ... rest of the function remains the same, but all calls to `updateStatus` must use the `statusFile` variable.
  // Example for failure case:
  updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
  // Example for success case:
  updateStatus(statusFile, s => { s.phase = "done"; s.steps[name] = "done"; });
}
```

#### **Step 3: Update the Main `runTask` Function**

Finally, modify `runTask` to call the new Git setup function at the beginning and use the isolated state file and log file names throughout the process.

```typescript
// In src/files/tools/orchestrator.ts
export async function runTask(taskPath: string) {
  // Setup the Git branch and get isolated file paths at the very start.
  const { branchName, statusFile } = setupGitBranch(taskPath);
  console.log(`[Orchestrator] Task running on branch '${branchName}'. State will be saved to '${statusFile}'.`);

  execSync("mkdir -p state logs", { stdio: "ignore" });
  
  const status = readStatus(statusFile);
  const taskContent = readFileSync(taskPath, 'utf-8');
  const logPrefix = `logs/${branchName.replace(/\//g, '-')}`;

  const initialInfo = { taskId: path.basename(taskPath), branch: branchName };

  // Helper to simplify step calls
  const runStep = (name: string, prompt: string, logSuffix: string, check: () => void | Promise<void>) => {
    return step(name, ["-p", prompt], `${logPrefix}-${logSuffix}.log`, check, statusFile, initialInfo);
  };
  
  // Step 1: Plan
  if (status.steps.plan !== 'done') {
    const planPrompt = createPrompt('plan-task.md', { /*...*/ });
    await runStep("plan", planPrompt, "01-plan", () => {
      if (!existsSync("PLAN.md")) throw new Error("PLAN.md missing");
    });
  } else {
    console.log("[Orchestrator] Skipping step 'plan' (already done).");
  }
  
  // Apply this pattern to all subsequent steps...
}
```

---

### part 1.b - Commit after each step
It's not just a good idea; it's the core mechanism that elevates this from a simple script into a robust, fault-tolerant automation system. While it might seem "noisy" at first, the benefits are immense.
Let's break down the "why."
The Core Benefits of Committing After Each Step
Crash-Safe Resumability (Checkpoints): This is the most important reason. Imagine the implement step runs for 10 minutes and generates five complex files. Then, just before it finishes, the Claude API has a network error, or your laptop battery dies.
Without Commits: All that generated code is just sitting in your working directory, un-staged. When you restart the orchestrator, it doesn't know if that code is good or half-finished. It would have to start the implement step all over again, wasting time and API calls.
With Commits: The moment a step succeeds, its result is permanently saved in a Git commit. If the next step (docs) fails, it doesn't matter. The work from plan, write_tests, and implement is safe. When you re-run the orchestrator, it sees that those steps are done and instantly picks up right where it left off. Each commit is a video game save point.
Atomic, Debuggable History: This is the second most important reason. Let's say the implement step succeeds, but it introduces a subtle bug, and the test:ci check fails.
Without Commits: You just have a bunch of file changes. It's hard to tell what the AI intended vs. what it actually did.
With Commits: You have a perfect, atomic history. You can run git diff chore(write_tests)..chore(implement) to see only the changes the AI made during the implementation step. This makes debugging incredibly easy. You can see exactly what code was written to satisfy the tests from the previous commit.
Enables Manual Intervention (The "Escape Hatch"): This is a power-user feature. Imagine the AI gets stuck in a loop trying to fix a failing test. It just can't figure it out.
Without Commits: Your repository is in a messy, half-working state.
With Commits: You can calmly Ctrl+C the orchestrator. Your repository is clean, checked out at the last successful commit (e.g., chore(write_tests)). You can now manually fix the code yourself, git commit your fix, and then manually update the state.json file to mark the implement step as done. When you restart the orchestrator, it will see your manual fix and continue on to the docs step. It turns the tool from a rigid black box into a true assistant that you can collaborate with.
Addressing the Main Drawback: A "Noisy" PR History
The only significant trade-off is that the final pull request will contain a series of small, incremental commits:
chore(plan): checkpoint
chore(write_tests): checkpoint
chore(implement): checkpoint
...and so on.
Some developers prefer a single, clean commit for each feature. However, this is a solved problem in modern Git workflows.
The Solution: Squash and Merge
When you merge the pull request into your main branch, you don't use a regular merge. You use the "Squash and Merge" option provided by GitHub, GitLab, Bitbucket, etc.
This feature takes all 6+ commits from your feature branch and squashes them down into a single, clean commit on the main branch.
This gives you the best of both worlds:
On the feature branch: A detailed, verbose history that is invaluable for debugging the AI's process.
On the main branch: A clean, atomic history where each commit represents a complete, finished feature.


### Part 2: V2 Vision — Handling Dependent Tasks

**Objective:** Allow tasks to be "stacked" on top of each other, where a new task branch is created from a previous task's branch instead of from `main`.

**Proposed User Flow:**

As you suggested, the dependency will be declared directly in the task's markdown file. This is a clean, declarative approach.

A new task file, `claude-Tasks/task-B.md`, could look like this:

```md
---
Depends on: claude-Tasks/task-A.md
---
# Implement Login Feature

## Objective
Create the login endpoint, which uses the User class defined in the previous task.
...
```

**Implementation Sketch:**

The `runTask` orchestrator would be enhanced with the following logic at the very beginning:

1.  **Parse Dependencies:** Before calling `setupGitBranch`, the orchestrator will read the task file (`task-B.md`) and look for a `Depends on:` key in its frontmatter.

2.  **Determine Base Branch:**
    *   If no `Depends on:` key is found, the `baseBranch` is `main` (the default Workflow 1 behavior).
    *   If `Depends on: claude-Tasks/task-A.md` *is* found, the orchestrator will call the `taskPathToBranchName` helper function on that parent task's path to determine its branch name (e.g., `claude/task-a`). This becomes the `baseBranch`.

3.  **Modified Git Setup:** The `setupGitBranch` function will be modified to accept an optional `baseBranch` parameter.
    *   Instead of hardcoding `git checkout main`, it will run `git checkout ${baseBranch}`.
    *   It will still pull from the remote to ensure that base branch is up-to-date (`git pull origin ${baseBranch}`).
    *   It will then create the new task branch (`claude/task-b`) from there.

4.  **Clear User Feedback:** The tool would provide clear output to the user:
    `[Orchestrator] Detected dependency on 'task-A.md'. Starting new branch from 'claude/task-a' instead of 'main'.`

This V2 enhancement would make the tool dramatically more powerful for complex projects, allowing developers to chain together related features and have the AI build them sequentially, all while maintaining a clean and logical Git history.