

# PLAN: Refactor Task and Sequence Identification

**Goal**: Rework the task and sequence identification logic to use unique, path-based IDs, preventing state collisions between different sequences.

## Description

Currently, the `taskId` is generated from the task's filename only (e.g., `01-create-plan.md`). This creates a critical bug where tasks with the same filename in different sequence folders (e.g., `sequence-A/01-create-plan.md` and `sequence-B/01-create-plan.md`) are treated as the same task. This causes state conflicts, incorrect branch naming, and results in the orchestrator improperly skipping tasks it believes are already complete.

This refactor will change the identification logic to be based on the task's full relative path, ensuring every task and its associated state, logs, and git branch are unique across the entire project.

## Summary Checklist

-   [ ] **Update `status.ts`**: Introduce a new `taskPathToTaskId` function and update the `TaskStatus` interface.
-   [ ] **Update `orchestrator.ts`**: Integrate the new ID generation logic for tasks and git branches.
-   [ ] **Update `web.ts`**: Refactor the web dashboard to use the new unique IDs and display correct task information.
-   [ ] **Test the changes**: Manually run two separate sequences with identically named task files to confirm they are treated as distinct tasks.
-   [ ] **Update Documentation**: Update `README.md` to reflect any user-facing changes or developer-facing concepts related to the new identification scheme.

---

## Detailed Implementation Steps

### 1. Update `status.ts` for Unique, Path-Based IDs

**Objective**: Modify the core status management file to generate unique IDs and store additional path information in the state.

**Tasks**:

1.  **Create `taskPathToTaskId` function**: This new function will accept a task's file path and the project root to generate a consistent, unique ID.
2.  **Update `TaskStatus` Interface**: Add a `taskPath: string;` property to store the task's relative path, providing a persistent reference to its location.
3.  **Update ID Generation in `folderPathToSequenceId`**: Sanitize the sequence folder name to prevent invalid characters in filenames.
4.  **Update `readStatus`**: Add backward compatibility to handle old state files that do not have the new `taskPath` property.

**Code Snippet (`src/tools/status.ts`)**:

```typescript
// New function to generate a unique task ID from its path
export function taskPathToTaskId(taskPath: string, projectRoot: string): string {
    const relativePath = path.isAbsolute(taskPath)
        ? path.relative(projectRoot, taskPath)
        : taskPath;

    const taskId = relativePath
        .replace(/\.md$/, '') // remove extension
        .replace(/[\\/]/g, '-') // replace path separators
        .replace(/[^a-z0-9-]/gi, '-'); // sanitize
    return `task-${taskId}`;
}

// Updated function to sanitize sequence folder names
export function folderPathToSequenceId(folderPath: string): string {
    const folderName = path.basename(path.resolve(folderPath));
    // Sanitize to make it a safe filename component
    const sanitizedName = folderName.replace(/[^a-z0-9-]/gi, '-');
    return `sequence-${sanitizedName}`;
}


// Updated TaskStatus interface
export type TaskStatus = {
  version: number;
  taskId: string;
  taskPath: string; // <-- Add this new property
  startTime: string;
  branch: string;
  // ... other properties
};

// Update readStatus for backward compatibility
export function readStatus(file: string): TaskStatus {
    if (fs.existsSync(file)) {
        try {
            const data = JSON.parse(fs.readFileSync(file, "utf8"));
            // Simple migration for old status files
            if (!data.taskPath) data.taskPath = "unknown";
            return data;
        } catch {
            return defaultStatus;
        }
    }
    return defaultStatus;
}
```

### 2. Update `orchestrator.ts` to Use New IDs

**Objective**: Modify the orchestrator to use the new `taskPathToTaskId` function for all task-related operations, including state management, logging, and branch naming.

**Tasks**:

1.  **Import `taskPathToTaskId`**: Import the new function from `status.ts`.
2.  **Update `taskPathToBranchName`**: Modify this function to use the new `taskPathToTaskId` function, ensuring branch names are as unique as the task IDs.
3.  **Update `runTask` and `executePipelineForTask`**: Replace all instances where a `taskId` is generated from `path.basename` with calls to the new `taskPathToTaskId` function.
4.  **Persist `taskPath`**: When creating or updating a task's state, ensure the `taskPath` property is saved with its relative path.

**Code Snippet (`src/tools/orchestrator.ts`)**:

```typescript
// Before
function taskPathToBranchName(taskPath: string): string {
  const taskFileName = path.basename(taskPath, '.md');
  // ... (sanitization)
  return `claude/${sanitized}`;
}

// After
function taskPathToBranchName(taskPath: string, projectRoot: string): string {
    const taskId = taskPathToTaskId(taskPath, projectRoot);
    // remove the "task-" prefix for the branch name for brevity
    const branchNameSegment = taskId.startsWith('task-') ? taskId.substring(5) : taskId;
    return `claude/${branchNameSegment}`;
}

// In runTask() and executePipelineForTask()
// Before
const taskId = path.basename(taskRelativePath, '.md').replace(/[^a-z0-9-]/gi, '-');

// After
const taskId = taskPathToTaskId(taskRelativePath, projectRoot);

// When updating status
updateStatus(statusFile, s => {
  s.taskId = taskId;
  s.taskPath = relativeTaskPath; // <-- Make sure to save the path
  //...
});
```

### 3. Update `web.ts` for UI Consistency

**Objective**: Refactor the web dashboard's backend to correctly identify and display task data using the new unique IDs and path information.

**Tasks**:

1.  **Filter Tasks**: In `getAllTaskStatuses`, ensure you are only reading task state files by filtering out files that start with `sequence-`.
2.  **Pass `taskPath` to Templates**: Ensure the `taskPath` property is available in the data passed to the EJS templates for the dashboard and sequence detail views.
3.  **Update `getSequenceDetails`**: When listing tasks within a sequence, use the stored `taskPath` for display and linking, ensuring the correct file is referenced.
4.  **Sort Tasks by Path**: In the sequence detail view, sort tasks alphabetically by `taskPath` to ensure a consistent and predictable order.

**Code Snippet (`src/tools/web.ts`)**:

```typescript
// In getAllTaskStatuses()
// Before
const files = fs.readdirSync(stateDir).filter(f => f.endsWith(".state.json"));

// After
const files = fs.readdirSync(stateDir).filter(f => f.endsWith(".state.json") && !f.startsWith("sequence-"));


// In getSequenceDetails()
// Before
// ... logic to derive filename from taskId
sequenceDetails.tasks.push({
    taskId: taskId,
    filename: filename, // <-- This was a guess
    // ...
});

// After
sequenceDetails.tasks.push({
    taskId: taskId,
    taskPath: taskState.taskPath || 'unknown', // <-- Use the reliable path
    status: taskStatus,
    phase: taskState.phase,
    lastUpdate: taskState.lastUpdate
});

// At the end of getSequenceDetails()
sequenceDetails.tasks.sort((a, b) => a.taskPath.localeCompare(b.taskPath));
```

### 4. Testing the Changes

**Objective**: Verify that the refactoring has fixed the state collision bug.

**Tasks**:

1.  **Create Test Structure**:
    -   Create two sequence folders: `claude-Tasks/sequence-A` and `claude-Tasks/sequence-B`.
    -   Inside each folder, create a task file with the exact same name, for example `01-do-something.md`.
2.  **Run First Sequence**:
    -   Execute `claude-project run-sequence claude-Tasks/sequence-A`.
    -   Confirm it runs successfully.
3.  **Run Second Sequence**:
    -   Execute `claude-project run-sequence claude-Tasks/sequence-B`.
    -   **Crucially, verify that it does NOT skip the `01-do-something.md` task.** It should run it as a new, distinct task.
4.  **Check State Files**:
    -   Inspect the `.claude/state/` directory. You should see two different state files, for example:
        -   `task-claude-Tasks-sequence-A-01-do-something.state.json`
        -   `task-claude-Tasks-sequence-B-01-do-something.state.json`

## Error Handling & Warnings

-   **Old State Files**: The `readStatus` function should gracefully handle old state files by populating the `taskPath` with a default value (`"unknown"`). This ensures the tool doesn't crash if it encounters state from a previous version. No CLI warnings are necessary for this, as it's a silent, backward-compatible upgrade.
-   **Invalid Paths**: The use of `path.relative` and sanitization in the ID generation functions should inherently handle most path-related edge cases. No new error handling is expected.

## Documentation Changes

**Objective**: Update the `README.md` to ensure all information is current.

**Task**:

-   Review the `README.md` file, especially sections related to state management, logging, and branch naming. While this change is mostly internal, double-check that no examples or explanations are now misleading. For instance, if branch names are shown as examples, they should be updated to reflect the new, longer format (e.g., `claude/sequence-A-01-do-something` instead of `claude/01-do-something`).