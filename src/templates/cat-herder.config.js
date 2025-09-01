// cat-herder.config.js
/** @type {import('@your-scope/cat-herder').ClaudeProjectConfig} */
module.exports = {
  taskFolder: "cat-herder-tasks",
  statePath: "~/.cat-herder/state",
  logsPath: "~/.cat-herder/logs",

  /**
   * If true (default), the orchestrator will automatically create and manage a
   * dedicated Git branch for each task. If false, it will run on your current branch.
   */
  manageGitBranch: true,

  /**
   * If true, the orchestrator automatically commits changes after each
   * successful step. Otherwise, false (default) disables this behavior and allow users
   * to control commits directly within their command prompts by adding instructions
   * like "commit the changes with the message 'feat: add new feature'".
   */
  autoCommit: false,

  /**
   * If true, the orchestrator will pause and wait when it hits the Claude
   * API usage limit, then automatically resume when the limit resets.
   * If false (default), it will fail gracefully with a message explaining
   * when you can resume manually. The task state is preserved so you can
   * re-run the command and pick up exactly where you left off.
   */
  waitForRateLimitReset: false,

  /**
   * Controls the AI agent's level of autonomy and when it seeks human guidance.
   * Scale: 0-5 where:
   * - 0 (default): Maximum autonomy, operates independently without interruption
   * - 1-2: Balanced autonomy, only seeks guidance when fundamentally blocked
   * - 3: Guided autonomy, asks for clarification on ambiguous requirements
   * - 4-5: Low autonomy, very cautious, seeks guidance before most decisions
   * 
   * Can be overridden per-task in YAML frontmatter with 'autonomyLevel: X'
   */
  autonomyLevel: 0,

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
      // Check that code passes type checking AND that tests fail as expected.
      check: [
        { type: "shell", command: "npx tsc --noEmit", expect: "pass" },
        { type: "shell", command: "npm test", expect: "fail" }
      ],
      fileAccess: {
        allowWrite: ["test/**/*", "tests/**/*"]
      }
    },
    {
      name: "implement",
      command: "implement",
      // Optional: Specify which Claude model to use for this step.
      // Useful for using more powerful models for complex implementation tasks.
      // model: "claude-opus-4-1-20250805",
      // Check that the tests now pass.
      check: { type: "shell", command: "npm test", expect: "pass" },
      fileAccess: {
        allowWrite: ["src/**/*"]
      },
      retry: 3
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
  },
};
