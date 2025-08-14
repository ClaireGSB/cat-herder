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

  manageGitBranch: true,
  autoCommit: false,
  defaultPipeline: "default",

  pipelines: {
    default: [
      {
        name: "plan",
        command: "plan-task",
        check: { type: "fileExists", path: "PLAN.md" },
        fileAccess: {
          allowWrite: ["PLAN.md"]
        }
      },
      {
        name: "implement",
        command: "implement",
        check: { type: "shell", command: "npm test", expect: "pass" },
        fileAccess: {
          allowWrite: ["src/**/*"]
        }
      }
    ]
  },
};