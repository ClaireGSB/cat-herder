---
description: Generate a precise implementation plan from a task file.
allowed-tools: Read, Write, Edit, Glob, Grep
---
Based on the task definition provided, and by exploring the project files if needed, create a clear, step-by-step implementation plan.

This plan must cover:
- The scope of the changes.
- Any new files to be created or existing files to be modified.
- Important interfaces, functions, or data shapes.
- Potential risks or edge cases to consider.
- A high-level test plan.

Write the entire plan to a new file named PLAN.md at the repository root. Overwrite the file if it already exists. Do not write or edit any other code.