// cat-herder.config.js
/** @type {import('@your-scope/cat-herder').ClaudeProjectConfig} */
module.exports = {
  taskFolder: "cat-herder-tasks",
  statePath: "~/.cat-herder/state",
  logsPath: "~/.cat-herder/logs",
  
  // Use 'claude' (default) or 'codex'
  // aiProvider: 'claude',

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
   * Defines the agent's level of operational independence on a scale of 0-5.
   * This setting controls how frequently the agent will pause to ask for human
   * clarification when it encounters ambiguity. See the project README for a
   * full breakdown of each level.
   *
   * 0: Absolute Autonomy (asks only if impossible to proceed)
   * 1: High Autonomy (asks only about unsafe/contradictory requirements)
   * 2: Default Autonomy (asks about major architectural gaps)
   * 3: Collaborative Autonomy (asks about ambiguous designs)
   * 4: Guided Execution (asks to confirm complex logic)
   * 5: Strict Oversight (presents all non-trivial options for a decision)
   *
   * Can be overridden per-task in YAML frontmatter with 'autonomyLevel: X'
   */
  autonomyLevel: 0,

  // Optional: Codex-specific runtime configuration
  // These values are passed to `codex exec` via --config flags so you don't
  // need to modify ~/.codex/config.toml for cat-herder runs.
  //
  // codex: {
  //   sandboxMode: 'workspace-write', // 'read-only' | 'workspace-write' | 'danger-full-access'
  //   networkAccess: false,           // applies when sandboxMode === 'workspace-write'
  //   profile: undefined,             // name of a profile in ~/.codex/config.toml (optional)
  //   envPolicy: {
  //     inherit: 'core',              // 'all' | 'core' | 'none'
  //     ignoreDefaultExcludes: false, // keep default KEY/SECRET/TOKEN filtering
  //     includeOnly: [ 'PATH', 'HOME', 'USER' ],
  //     // exclude: [ 'AWS_*' ],
  //     // set: { CI: '1' }
  //   }
  // },

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
