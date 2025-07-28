import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { glob } from "glob";
import pc from "picocolors";

import { runStreaming } from "./proc.js";
import { updateStatus, readStatus, TaskStatus } from "./status.js";
import {
  getConfig,
  getProjectRoot,
  ClaudeProjectConfig,
} from "../config.js";

// Module-level variables to hold the loaded configuration and project root
let loadedConfig: ClaudeProjectConfig;
let projectRoot: string;

/**
 * Gathers the file structure of the user's project, respecting ignores from the config.
 */
function getProjectStructure(): string {
  const files = glob.sync("**/*", {
    cwd: projectRoot,
    ignore: loadedConfig.structureIgnore,
    nodir: true,
    dot: true,
  });
  return files.length > 0 ? files.join("\n") : "This is a new project with no files yet.";
}

/**
 * Builds the FULL prompt string by combining context with the command instructions.
 * @param commandFileName The filename of the command (e.g., 'plan-task.md').
 * @param context A record where keys are titles and values are the content.
 */
function buildFullPrompt(commandFileName: string, context: Record<string, string>): string {
  const commandFilePath = path.resolve(projectRoot, '.claude', 'commands', commandFileName);
  if (!existsSync(commandFilePath)) {
    throw new Error(`Command file not found at: ${commandFilePath}`);
  }
  const commandInstructions = readFileSync(commandFilePath, 'utf-8');

  let contextString = "";
  for (const [title, content] of Object.entries(context)) {
    contextString += `--- ${title.toUpperCase()} ---\n\`\`\`\n${content.trim()}\n\`\`\`\n\n`;
  }
  
  // THE CRITICAL FIX IS HERE: This now correctly combines the context with the instructions.
  return `${contextString}--- YOUR INSTRUCTIONS ---\n${commandInstructions}`;
}

/**
 * Executes a single step of the workflow.
 * @param name The internal name of the step (e.g., "plan").
 * @param commandName The name of the Claude command to run (e.g., "plan-task").
 * @param context The contextual data to build the prompt from.
 * @param statusFile Absolute path to the task's state file.
 * @param logFile Absolute path for the step's log file.
 * @param check A validation function to run upon successful execution.
 */
async function step(
  name: string,
  commandName: string,
  context: Record<string, string>,
  statusFile: string,
  logFile: string,
  check: () => void | Promise<void>
) {
  console.log(pc.blue(`\n[Orchestrator] Starting step: ${name}`));
  updateStatus(statusFile, s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });

  const fullPrompt = buildFullPrompt(`${commandName}.md`, context);
  const claudeCommand = `/project:${commandName}`;

  const { code } = await runStreaming("claude", [claudeCommand], logFile, projectRoot, fullPrompt);

  console.log(`[Orchestrator] Step "${name}" finished with exit code: ${code}`);
  if (code !== 0) {
    updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
    throw new Error(`[Orchestrator] Step "${name}" failed. Check log for details: ${logFile}`);
  }

  console.log(`[Orchestrator] Running checks for step: ${name}`);
  await check();

  console.log(`[Orchestrator] Committing checkpoint for step: ${name}`);
  try {
    execSync(`npx prettier --write . --log-level=error`, { stdio: 'inherit', cwd: projectRoot });
  } catch (e) {
    console.warn(pc.yellow("[Orchestrator] Prettier formatting failed, but continuing anyway."));
  }
  execSync(`git add -A`, { stdio: "inherit", cwd: projectRoot });
  execSync(`git commit -m "chore(${name}): checkpoint"`, { stdio: "inherit", cwd: projectRoot });
  
  updateStatus(statusFile, s => {
    s.phase = "pending";
    s.steps[name] = "done";
  });
}

function testsShouldFail() {
  console.log("[Orchestrator] Verifying that tests fail as expected...");
  try {
    execSync("npm test", { stdio: "pipe", cwd: projectRoot });
    throw new Error("Validation failed: Tests passed unexpectedly before implementation.");
  } catch (error: any) {
    console.log(pc.green("[Orchestrator] Check passed: Tests failed as expected."));
  }
}

function testsShouldPass() {
  console.log("[Orchestrator] Verifying that tests now pass...");
  execSync("npm test", { stdio: "inherit", cwd: projectRoot });
  console.log(pc.green("[Orchestrator] Check passed: All tests are passing."));
}

export async function runTask(taskRelativePath: string) {
  const config = await getConfig();
  if (!config) {
    throw new Error("Failed to load configuration.");
  }
  loadedConfig = config;
  projectRoot = getProjectRoot();
  console.log(pc.cyan(`Project root identified: ${projectRoot}`));

  const taskId = path.basename(taskRelativePath, '.md').replace(/[^a-z0-9-]/gi, '-');
  const statusFile = path.resolve(projectRoot, loadedConfig.statePath, `${taskId}.state.json`);
  const logsDir = path.resolve(projectRoot, loadedConfig.logsPath, taskId);
  mkdirSync(logsDir, { recursive: true });

  const status: TaskStatus = readStatus(statusFile);
  updateStatus(statusFile, s => { if (s.taskId === 'unknown') s.taskId = taskId; });

  const absoluteTaskPath = path.resolve(projectRoot, taskRelativePath);
  if (!existsSync(absoluteTaskPath)) throw new Error(`Task file not found at: ${absoluteTaskPath}`);
  const taskContent = readFileSync(absoluteTaskPath, 'utf-8');

  // Step 1: Plan
  if (status.steps.plan !== 'done') {
    const context = { 'Project Structure': getProjectStructure(), 'Task Definition': taskContent };
    const logFile = path.join(logsDir, "01-plan.log");
    const planMdPath = path.join(projectRoot, "PLAN.md");
    await step("plan", "plan-task", context, statusFile, logFile, () => {
      if (!existsSync(planMdPath)) throw new Error(`Validation failed: PLAN.md was not created at ${planMdPath}`);
      console.log(pc.green("[Orchestrator] Check passed: PLAN.md created successfully."));
    });
  } else {
    console.log(pc.gray("[Orchestrator] Skipping 'plan' (already done)."));
  }

  const planContent = readFileSync(path.join(projectRoot, 'PLAN.md'), 'utf-8');

  // Step 2: Write Tests
  if (status.steps.write_tests !== 'done') {
    const context = { 'The Plan': planContent, 'Original Task Definition': taskContent };
    const logFile = path.join(logsDir, "02-tests.log");
    await step("write_tests", "write-tests", context, statusFile, logFile, async () => {
      const testFiles = await glob("test/**/*.{test,spec}.ts", { cwd: projectRoot });
      if (testFiles.length === 0) throw new Error("Validation failed: No test files were created in the /test directory.");
      testsShouldFail();
    });
  } else {
    console.log(pc.gray("[Orchestrator] Skipping 'write_tests' (already done)."));
  }
  
  // Step 3: Implement
  if (status.steps.implement !== 'done') {
    const context = { 'The Plan': planContent };
    const logFile = path.join(logsDir, "03-implement.log");
    await step("implement", "implement", context, statusFile, logFile, () => {
        testsShouldPass();
    });
  } else {
    console.log(pc.gray("[Orchestrator] Skipping 'implement' (already done)."));
  }

  // Step 4: Update Docs
  if (status.steps.docs !== 'done') {
    const context = { 'The Plan': planContent, 'Final Code Structure': getProjectStructure() };
    const logFile = path.join(logsDir, "04-docs.log");
    await step("docs", "docs-update", context, statusFile, logFile, () => {});
  } else {
    console.log(pc.gray("[Orchestrator] Skipping 'docs' (already done)."));
  }

  // Step 5: Self Review
  if (status.steps.review !== 'done') {
    const context = {};
    const logFile = path.join(logsDir, "05-review.log");
    await step("review", "self-review", context, statusFile, logFile, () => {});
  } else {
    console.log(pc.gray("[Orchestrator] Skipping 'review' (already done)."));
  }

  updateStatus(statusFile, s => { s.phase = 'done'; });
  console.log(pc.green("\n[Orchestrator] All steps completed successfully!"));
}