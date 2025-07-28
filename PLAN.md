

# Implementation Plan: Robust Git Workflow

### Goal

To integrate a safe, automated Git branching strategy into the orchestrator. For every `claude-project run`, the tool will automatically create a unique, dedicated branch for the task. This will isolate the AI's work, prevent accidental commits to primary branches, and establish a clean foundation for future features like pull request generation.

### Description

The current system commits work directly to the user's current branch. We will modify the `orchestrator.ts` to perform the following sequence at the beginning of a `runTask` execution:
1.  **Safety Check:** Verify that the user's Git working directory is clean. If not, abort with a helpful message.
2.  **Sync `main`:** Check out and pull the latest changes for the `main` branch to ensure the task starts from a fresh, up-to-date baseline.
3.  **Create Task Branch:** Generate a unique branch name from the task file (e.g., `claude/create-simple-math-utility`).
4.  **Execute on Branch:** Perform all subsequent operations (running steps, making `chore` commits) on this newly created task branch.

This makes the tool dramatically safer and aligns with professional development best practices.

---

## Summary Checklist

-   [x] **Step 1:** Add Git helper functions to the orchestrator.
-   [x] **Step 2:** Integrate the Git setup logic at the beginning of `runTask`.
-   [ ] **Step 3:** Update the `README.md` to explain the new branching behavior.

---

## Detailed Implementation Steps

### Step 1: Add Git Helper Functions

**Objective:** Create two new functions inside `orchestrator.ts` to handle branch name generation and the Git setup sequence.

**Task:** Add the following functions to the top of `src/tools/orchestrator.ts`.

**File: `src/tools/orchestrator.ts` (Additions)**
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
 * Sets up the Git environment for a task run.
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

  // 2. Sync with the main branch.
  console.log(pc.gray("  › Syncing with main branch..."));
  execSync('git checkout main', { cwd: projectRoot, stdio: 'pipe' });
  execSync('git pull origin main', { cwd: projectRoot, stdio: 'pipe' });

  // 3. Create or check out the dedicated task branch.
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

**Objective:** Call the new `setupGitBranch` function at the very beginning of the `runTask` execution flow.

**Task:** Modify the `runTask` function in `src/tools/orchestrator.ts`.

**File: `src/tools/orchestrator.ts` (Updated `runTask`)**
```typescript
// ... imports and helper functions ...

export async function runTask(taskRelativePath: string) {
  const config = await getConfig();
  const projectRoot = getProjectRoot();

  // --- NEW GIT WORKFLOW INTEGRATION ---
  // This is now the first action of any run.
  const branchName = setupGitBranch(projectRoot, taskRelativePath);
  console.log(pc.cyan(`[Orchestrator] Task will be executed on branch: ${branchName}`));
  // --- END OF NEW SECTION ---

  const { isValid, errors } = validatePipeline(config, projectRoot);
  // ... (rest of the function continues as before, validation, setup, loop, etc.)
}
```

### Step 3: Update README.md

**Objective:** Inform users about this important new behavior so they understand where the AI's work is being committed.

**Task:** Add a new subsection to the "How It Works" section of the main `README.md`.

**File: `README.md` (Add this new section)**
```markdown
### Isolated Git Branches

To ensure safety and a clean Git history, the orchestrator automatically manages branches for you. When you run a task:

1.  It first checks that your repository has no uncommitted changes.
2.  It creates a unique, dedicated branch for the task (e.g., `claude/my-new-feature`).
3.  All commits generated by the AI during the pipeline are made to this task branch.

This keeps your `main` branch clean and isolates all automated work, preparing it for a proper code review and pull request.
```