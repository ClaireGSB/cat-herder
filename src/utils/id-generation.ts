import path from "node:path";

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

export function folderPathToSequenceId(folderPath: string): string {
    // Convert path like "claude-Tasks/my-feature" to "sequence-my-feature"
    const folderName = path.basename(path.resolve(folderPath));
    // Sanitize to make it a safe filename component
    const sanitizedName = folderName.replace(/[^a-z0-9-]/gi, '-');
    return `sequence-${sanitizedName}`;
}