# Create a Simple Math Utility

## Objective
Create a simple utility function that adds two numbers. This task is for testing the basic workflow of the development automation.

## Requirements
- Create a new file located at `src/math.ts`.
- Inside this file, export a function named `add`.
- The `add` function must accept two arguments, `a` and `b`.
- It must return the sum of these two numbers.
- Both the arguments and the return value must be explicitly typed as `number` in TypeScript.

## Acceptance Criteria
- A new test file, `test/math.test.ts`, must be created.
- The test file must verify the following cases for the `add` function:
  - `add(2, 3)` returns `5`.
  - `add(-1, 1)` returns `0`.
  - `add(0, 0)` returns `0`.
- The main `README.md` file should be updated with a short section describing this new math utility.

## Notes
This is a sample task to demonstrate the claude-project workflow. It includes planning, testing, implementation, documentation, and review phases.