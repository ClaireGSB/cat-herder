// claude.config.js
/** @type {import('@your-scope/claude-project').ClaudeProjectConfig} */
module.exports = {
  taskFolder: "claude-Tasks",
  statePath: ".claude/state",
  logsPath: ".claude/logs",
  structureIgnore: [
    "node_modules/**",
    ".git/**",
    "dist/**",
    ".claude/**",
    "*.lock",
  ],

  /**
   * If true (default), the orchestrator will automatically create and manage a
   * dedicated Git branch for each task. If false, it will run on your current branch.
   */
  manageGitBranch: true,

  /**
   * Default pipeline to use when none is specified.
   */
  defaultPipeline: 'default',

  /**
   * Multiple named pipelines for different types of tasks.
   * Each pipeline defines a sequence of steps to execute.
   */
  pipelines: {
    default: [
    {
      name: "plan",
      command: "plan-task",
      // Check that the PLAN.md file was created.
      check: { type: "fileExists", path: "PLAN.md" },
      fileAccess: {
        allowWrite: ["PLAN.md"]
      }
    },
    {
      name: "write_tests",
      command: "write-tests",
      // Check that tests were written AND that they fail as expected.
      check: { type: "shell", command: "npm test", expect: "fail" },
      fileAccess: {
        allowWrite: ["test/**/*", "tests/**/*"]
      }
    },
    {
      name: "implement",
      command: "implement",
      // Check that the tests now pass.
      check: { type: "shell", command: "npm test", expect: "pass" },
      fileAccess: {
        allowWrite: ["src/**/*"]
      }
    },
    {
      name: "docs",
      command: "docs-update",
      // No automated check for documentation; this is a manual review step.
      check: { type: "none" },
      fileAccess: {
        allowWrite: ["README.md", "docs/**/*", "*.md"]
      }
    },
    {
      name: "review",
      command: "self-review",
      check: { type: "none" },
      // No fileAccess restriction for review step - allows any necessary fixes
    },
    ],
    /*
    "docs-only": [
       {
        name: "docs",
        command: "docs-update",
        check: { type: "none" },
        fileAccess: {
          allowWrite: ["README.md", "docs/**/*", "*.md"]
        }
      }
    ]
    */
  },
};
