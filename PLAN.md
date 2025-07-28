

# Implementation Plan: State-Aware & Configurable Task Orchestration

### Goal

To refactor the `runTask` orchestrator into a fully state-aware and user-configurable system. The tool will: (1) check if a task is already complete before taking any action; (2) intelligently resume tasks on their existing Git branches; and (3) allow users to disable the automatic branch management entirely via a new configuration setting.

### Description

This plan addresses several key user experience improvements. The start of the `runTask` flow will be re-architected to follow this logic:

1.  **Status First:** The tool will read the task's `state.json` file. If the task is `done`, it exits gracefully.
2.  **Check Branching Config:** A new flag, `manageGitBranch`, will be added to `claude.config.js` (defaulting to `true`).
3.  **Execute Git Logic (if enabled):** If `manageGitBranch` is `true`, the tool will perform the state-aware branching logic:
    *   **Resume:** If on the correct branch, it continues.
    *   **New Task:** If on a different branch, it performs the safe setup (clean check, sync main, checkout task branch).
4.  **Execute Git Logic (if disabled):** If `manageGitBranch` is `false`, the tool will skip all branch-related checks and operations, printing a warning that it's operating on the user's current branch.
5.  **Run Pipeline:** The pipeline execution proceeds as normal on whichever branch is active after the Git logic is complete.

This provides the best of all worlds: a safe, automated default for most users, and a flexible "power user" mode for those with custom workflows.

---

## Summary Checklist

-   [ ] **Step 1:** Update the Configuration Template (`claude.config.js`) to include the new `manageGitBranch` flag.
-   [ ] **Step 2:** Modify the Git Function to Respect the Configuration Flag.
-   [ ] **Step 3:** Refactor the `runTask` Orchestrator for the Complete State-First Logic.
-   [ ] **Step 4:** Update the `README.md` to Explain the New Behavior and Configuration Option.

---

## Detailed Implementation Steps

### Step 1: Update the Configuration Template

**Objective:** Add the new `manageGitBranch` boolean flag to the default configuration.

**Task:** Add the new property to `src/templates/claude.config.js`.

**File: `src/templates/claude.config.js` (Updated)**
```javascript
// claude.config.js
/** @type {import('@your-scope/claude-project').ClaudeProjectConfig} */
module.exports = {
  taskFolder: "claude-Tasks",
  statePath: ".claude/state",
  logsPath: ".claude/logs",
  structureIgnore: [ /* ... */ ],

  /**
   * (NEW) If true, the orchestrator will automatically create and manage a
   * dedicated Git branch for each task. If false, it will run on your current branch.
   */
  manageGitBranch: true,

  pipeline: [ /* ... */ ],
};
```

### Step 2: Modify the Git Function to Respect the Flag

**Objective:** Wrap the logic in our `ensureCorrectGitBranch` function in a conditional check based on the new config flag.

**Task:** Modify the `ensureCorrectGitBranch` function in `src/tools/orchestrator.ts`.

**File: `src/tools/orchestrator.ts` (Updated `ensureCorrectGitBranch`)**
```typescript
// ... (imports and taskPathToBranchName helper function remain the same) ...

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
```

### Step 3: Refactor the `runTask` Orchestrator

**Objective:** Update the main `runTask` function to pass the `config` object to the Git function.

**Task:** Replace the `runTask` function in `src/tools/orchestrator.ts` with this final version.

**File: `src/tools/orchestrator.ts` (Final `runTask` function)**
```typescript
export async function runTask(taskRelativePath: string) {
  const config = await getConfig();
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
    const context = {};
    for (const key of contextKeys) {
      context[key] = contextProviders[key](projectRoot, taskContent);
    }
    const logFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.log`);
    await executeStep(name, command, context, statusFile, logFile, check);
  }

  updateStatus(statusFile, s => { s.phase = 'done'; });
  console.log(pc.green("\n[Orchestrator] All steps completed successfully!"));
}
```

### Step 4: Update README.md

**Objective:** Document the new `manageGitBranch` configuration option so users know it exists.

**Task:** Add a description of the new flag in the `README.md`'s configuration section.

**File: `README.md` (Updated "How It Works" Section)**```markdown
## How It Works

### The Configurable Pipeline (`claude.config.js`)

This tool is driven by a `pipeline` array in your `claude.config.js`. You have full control to customize the workflow. The config file also contains other settings:

```javascript
// claude.config.js
module.exports = {
  // ... taskFolder, statePath, etc.

  /**
   * If true (default), the tool automatically creates a dedicated Git branch
   * for each task. Set to false to run the tool on your current branch.
   */
  manageGitBranch: true,

  pipeline: [ /* ... your steps ... */ ],
};
```

### Isolated and Resumable Git Branches

By default (`manageGitBranch: true`), the orchestrator automatically manages Git branches for you. When you run a task:
// ... (rest of the section is the same)```