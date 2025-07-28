// claude.config.js

/**
 * Configuration for the claude-project CLI tool.
 * @type {import('@your-scope/claude-project').ClaudeProjectConfig}
 */
module.exports = {
  /**
   * The folder where your task markdown files are stored.
   */
  taskFolder: "claude-Tasks",

  /**
   * The directory to store state files for running tasks.
   */
  statePath: ".claude/state",

  /**
   * The directory to store detailed logs for each step of a task.
   */
  logsPath: ".claude/logs",

  /**
   * An array of glob patterns to ignore when gathering project structure.
   */
  structureIgnore: [
    "node_modules/**",
    ".git/**",
    "dist/**",
    ".claude/**",
    "*.lock",
  ],
};
