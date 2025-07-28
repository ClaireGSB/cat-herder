## Reactivate GitHub steps

See CLI output from initial run:

```
[Orchestrator] Starting step: pr
[Proc] Spawning: claude --verbose -p You are an expert software engineer.

--- YOUR INSTRUCTIONS ---
---
description: Push branch and open a draft PR via gh.
allowed-tools: Bash(git *:*), Bash(gh pr create:*), Read
---

Your task is to open a pull request. Please perform the following steps using shell commands:

1.  Verify the current git branch name.
2.  Push the current branch to the remote origin.
3.  Create a new, draft pull request on GitHub.
4.  Use the `PLAN.md` file to help you write a clear and descriptive title and body for the pull request. Include a summary of changes and how to test them.

[Proc] Logging to: logs/06-pr.log
I need permission to run bash commands to complete your request. Please grant permissions for the Bash tool so I can:

1. Push the current branch to remote origin
2. Create a draft pull request on GitHub

Once you grant permissions, I'll continue with pushing the branch and creating the PR based on the math utility implementation plan I found in PLAN.md.
[Proc] Subprocess exited with code 0
```

Therefore I'm deactivating the GitHub steps for now. When the pipeline is more mature, we can reactivate them.
