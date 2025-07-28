### 2. Make the orchestrator context aware
The entire system is **specifically designed to be resumable.** The user flow should be as simple as possible. If there is a rate-limiting error (Claude usage limit reached), When the user is ready to try again, they should run the exact same command as before. (that's V1, V2 is to auto-resume at the time the error says the quota will be reset).

The orchestrator should then be smart enough to see which steps are already `done` and automatically pick up from the exact step that was `interrupted` or `failed`.

This is made possible by our `state/current.state.json` file. It's the "memory" of the process. All we need to do is teach the orchestrator how to read this memory at the beginning of a run.

We will make two small changes:
1.  Add a `readStatus` function to `status.ts` to load the current state.
2.  Update the `orchestrator.ts` to check the status of each step before running it.

#### Step 1: Add a `readStatus` function to `status.ts`

In your main `claude-project`, open `src/files/tools/status.ts` and add this new exported function. It's the counterpart to `updateStatus`.

```typescript
// in src/files/tools/status.ts

import fs from "node:fs";
import path from "node:path";

export type Phase = "pending" | "running" | "done" | "failed" | "interrupted";
// ... (TaskStatus type is the same) ...

// --- ADD THIS NEW FUNCTION ---
export function readStatus(file: string): TaskStatus {
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  // Return a default, clean state if the file doesn't exist
  return { 
    version: 1, 
    taskId: "unknown", 
    branch: "", 
    currentStep: "", 
    phase: "pending", 
    steps: {}, 
    lastUpdate: new Date().toISOString() 
  };
}

// ... (writeJsonAtomic function is the same) ...

// updateStatus function is the same, but now uses readStatus
export function updateStatus(file: string, mut: (s: TaskStatus) => void) {
  let s: TaskStatus = readStatus(file); // <-- Use our new function
  mut(s);
  s.lastUpdate = new Date().toISOString();
  writeJsonAtomic(file, s);
}
```
*(Note: We also updated `updateStatus` to use this new function for consistency).*

#### Step 2: Make `orchestrator.ts` Check State Before Running a Step

Now, let's update the main `runTask` function in `src/files/tools/orchestrator.ts` to be resumable.

**Replace the `runTask` function with this state-aware version:**

```typescript
// in src/files/tools/orchestrator.ts
// Make sure to import readStatus
import { readStatus, updateStatus } from "./status.js";

// ... (getProjectStructure, createPrompt, step, testsShouldFail/Pass functions are all the same) ...

export async function runTask(taskPath: string) {
  execSync("mkdir -p state logs", { stdio: "ignore" });
  
  const statusFile = "state/current.state.json";
  const status = readStatus(statusFile);

  const taskContent = readFileSync(taskPath, 'utf-8');

  // Step 1: Plan
  if (status.steps.plan !== 'done') {
    const planPrompt = createPrompt('plan-task.md', {
      'Project Structure': getProjectStructure(),
      'Task Definition': taskContent
    });
    await step("plan", ["-p", planPrompt], "logs/01-plan.log", () => {
      if (!existsSync("PLAN.md")) throw new Error("PLAN.md missing");
    });
  } else {
    console.log("[Orchestrator] Skipping step 'plan' (already done).");
  }

  const planContent = readFileSync('PLAN.md', 'utf-8');

  // Step 2: Write Tests
  if (status.steps.write_tests !== 'done') {
    const writeTestsPrompt = createPrompt('write-tests.md', {
      'The Plan': planContent,
      'Original Task Definition': taskContent
    });
    await step("write_tests", ["-p", writeTestsPrompt], "logs/02-tests.log", async () => {
      const tests = await glob("test/**/*.{test,spec}.ts");
      if (!tests.length) throw new Error("No tests found");
      testsShouldFail();
    });
  } else {
    console.log("[Orchestrator] Skipping step 'write_tests' (already done).");
  }
  
  // Step 3: Implement
  if (status.steps.implement !== 'done') {
    const implementPrompt = createPrompt('implement.md', { 'The Plan': planContent });
    await step("implement", ["-p", implementPrompt], "logs/03-implement.log", () => { testsShouldPass(); });
  } else {
    console.log("[Orchestrator] Skipping step 'implement' (already done).");
  }

  // ... And so on for the remaining steps, wrapping each one in the same if/else block
  
  // Step 4: Docs
  if (status.steps.docs !== 'done') {
    const docsPrompt = createPrompt('docs-update.md', {});
    await step("docs", ["-p", docsPrompt], "logs/04-docs.log", () => {});
  } else {
    console.log("[Orchestrator] Skipping step 'docs' (already done).");
  }

  // Step 5: Review
  if (status.steps.review !== 'done') {
    const reviewPrompt = createPrompt('self-review.md', {});
    await step("review", ["-p", reviewPrompt], "logs/05-review.log", () => {});
  } else {
    console.log("[Orchestrator] Skipping step 'review' (already done).");
  }

  // Step 6: PR
  if (status.steps.pr !== 'done') {
    const prPrompt = createPrompt('push-pr.md', {});
    await step("pr", ["-p", prPrompt], "logs/06-pr.log", () => {});
  } else {
    console.log("[Orchestrator] Skipping step 'pr' (already done).");
  }
  
  console.log("\n[Orchestrator] All steps completed successfully!");
}
```

#### How the New Flow Works

1.  The user runs the command.
2.  `runTask` starts and immediately calls `readStatus` to load `state/current.state.json`.
3.  It checks `status.steps.plan`. Since it's `'done'`, it prints "[Orchestrator] Skipping step 'plan'..." and moves on.
4.  It checks `status.steps.write_tests`. This step is currently marked as `'interrupted'` (not `'done'`).
5.  The `if` condition passes, and it proceeds to run the `write_tests` step normally by assembling the prompt and calling `step()`.
6.  If it succeeds, `step()` will update the status of `write_tests` to `'done'` and commit the new test files.
7.  The orchestrator will then continue to the `implement` step and so on, until the entire workflow is complete.

This makes your automation tool incredibly robust and user-friendly. Crashes, network errors, or API limits are no longer catastrophic failures—they are just temporary interruptions.
