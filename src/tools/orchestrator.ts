import { execSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import yaml from 'js-yaml';
import { runStreaming, StreamResult } from "./proc.js";
import { updateStatus, readStatus, TaskStatus } from "./status.js";
import { getConfig, getProjectRoot, ClaudeProjectConfig, PipelineStep } from "../config.js";
import { runCheck, CheckConfig, CheckResult } from "./check-runner.js";
import { contextProviders } from "./providers.js";
import { validatePipeline } from "./validator.js";

/**
 * Parses YAML frontmatter from a task file to extract pipeline configuration.
 * @param content The raw content of the task file.
 * @returns An object containing the pipeline name (if specified) and the task body without frontmatter.
 */
function parseTaskFrontmatter(content: string): { pipeline?: string; body: string } {
  const match = content.match(/^---\s*([\s\S]+?)\s*---/);
  if (match) {
    try {
      const frontmatter = yaml.load(match[1]) as Record<string, any> | undefined;
      const body = content.substring(match[0].length).trim();
      return { pipeline: frontmatter?.pipeline, body };
    } catch {
      return { body: content };
    }
  }
  return { body: content };
}

/**
 * Assembles the complete prompt for Claude for a given pipeline step.
 * It provides context about the entire workflow and the current step.
 *
 * @param pipeline - The entire pipeline configuration array.
 * @param currentStepName - The `name` of the step Claude is currently executing.
 * @param context - A record of contextual information (e.g., task definition, plan content).
 * @param commandInstructions - The specific instructions loaded from the command markdown file.
 * @returns The fully assembled prompt string to be sent to Claude.
 */
function assemblePrompt(
  pipeline: PipelineStep[],
  currentStepName: string,
  context: Record<string, string>,
  commandInstructions: string
): string {
  // 1. Explain that the task is part of a larger, multi-step process.
  const intro = `Here is a task that has been broken down into several steps. You are an autonomous agent responsible for completing one step at a time.`;

  // 2. Provide the entire pipeline definition as a simple numbered list.
  const pipelineStepsList = pipeline.map((step, index) => `${index + 1}. ${step.name}`).join('\n');
  const pipelineContext = `This is the full pipeline for your awareness:\n${pipelineStepsList}`;

  // 3. Clearly state which step Claude is responsible for right now.
  const responsibility = `You are responsible for executing step "${currentStepName}".`;

  // 4. Assemble the specific context data required for this step.
  let contextString = "";
  for (const [title, content] of Object.entries(context)) {
    contextString += `--- ${title.toUpperCase()} ---\n\`\`\`\n${content.trim()}\n\`\`\`\n\n`;
  }

  if (contextString) { // Check if there's any context left to display
    contextString = contextString.trim();
  }


  // 5. Combine all parts into the final prompt.
  return [
    intro,
    pipelineContext,
    responsibility,
    contextString,
    `--- YOUR INSTRUCTIONS FOR THE "${currentStepName}" STEP ---`,
    commandInstructions,
  ]
    .filter(Boolean) // Remove any empty strings
    .join("\n\n");
}



/**
 * Converts a task file path into a Git-friendly branch name.
 * e.g., "claude-Tasks/01-sample.md" -> "claude/01-sample"
 * @param taskPath The path to the task file.
 */
function taskPathToBranchName(taskPath: string): string {
  const taskFileName = path.basename(taskPath, '.md');
  const sanitized = taskFileName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
  return `claude/${sanitized}`;
}

/**
 * Ensures the repository is on the correct branch for the given task,
 * respecting the user's configuration.
 * @param config The loaded project configuration.
 * @param projectRoot The absolute path to the project root.
 * @param taskPath The path to the task file.
 * @returns The name of the branch the task will run on.
 */
function ensureCorrectGitBranch(config: ClaudeProjectConfig, projectRoot: string, taskPath: string): string {
  const currentBranch = execSync('git branch --show-current', { cwd: projectRoot }).toString().trim();

  // SCENARIO A: User has disabled automatic branch management.
  if (config.manageGitBranch === false) {
    console.log(pc.yellow("› Automatic branch management is disabled."));
    console.log(pc.yellow(`› Task will run on your current branch: "${currentBranch}"`));
    return currentBranch;
  }

  // SCENARIO B: Branch management is enabled (default behavior).
  const expectedBranch = taskPathToBranchName(taskPath);

  if (currentBranch === expectedBranch) {
    console.log(pc.cyan(`[Orchestrator] Resuming task on existing branch: "${expectedBranch}"`));
    return expectedBranch;
  }

  console.log(pc.cyan("[Orchestrator] Setting up Git environment..."));

  const gitStatus = execSync('git status --porcelain', { cwd: projectRoot }).toString().trim();
  if (gitStatus) {
    throw new Error(`Git working directory on branch "${currentBranch}" is not clean. Please commit or stash your changes.`);
  }

  console.log(pc.gray("  › Switching to main branch..."));
  try {
    execSync('git checkout main', { cwd: projectRoot, stdio: 'pipe' });
  } catch (e) {
    throw new Error("Could not check out 'main' branch. A 'main' branch is required for automated branch management.");
  }

  try {
    execSync('git remote get-url origin', { cwd: projectRoot, stdio: 'pipe' });
    console.log(pc.gray("  › Remote 'origin' found. Syncing..."));
    execSync('git pull origin main', { cwd: projectRoot, stdio: 'pipe', timeout: 5000 });
  } catch (err) {
    console.log(pc.yellow("  › No remote 'origin' found or pull failed. Proceeding with local 'main'."));
  }

  const existingBranches = execSync(`git branch --list ${expectedBranch}`, { cwd: projectRoot }).toString().trim();
  if (existingBranches) {
    console.log(pc.yellow(`  › Branch "${expectedBranch}" already exists. Checking it out.`));
    execSync(`git checkout ${expectedBranch}`, { cwd: projectRoot, stdio: 'pipe' });
  } else {
    console.log(pc.green(`  › Creating and checking out new branch: "${expectedBranch}"`));
    execSync(`git checkout -b ${expectedBranch}`, { cwd: projectRoot, stdio: 'pipe' });
  }

  return expectedBranch;
}

async function executeStep(
  stepConfig: PipelineStep,
  fullPrompt: string,
  statusFile: string,
  logFile: string,
  reasoningLogFile: string,
  rawJsonLogFile: string
) {
  const { name, command, check, retry } = stepConfig;
  const projectRoot = getProjectRoot();
  const maxRetries = retry ?? 0;
  let currentPrompt = fullPrompt;

  console.log(pc.cyan(`\n[Orchestrator] Starting step: ${name}`));
  updateStatus(statusFile, s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (attempt > 1) {
      console.log(pc.yellow(`\n[Orchestrator] Retry attempt ${attempt}/${maxRetries} for step: ${name}`));
    }

    // Execute the main Claude command
    const result = await runStreaming("claude", [`/project:${command}`], logFile, reasoningLogFile, projectRoot, currentPrompt, rawJsonLogFile);
    
    // Check for rate limit error
    if (result.rateLimit) {
      const config = await getConfig();
      const resetTime = new Date(result.rateLimit.resetTimestamp * 1000);
      
      if (config.waitForRateLimitReset) {
        // Wait & Resume Logic
        const waitMs = resetTime.getTime() - Date.now();
        if (waitMs > 0) {
          console.log(pc.yellow(`[Orchestrator] Claude API usage limit reached.`));
          
          // Check for excessively long wait times (8 hours = 28,800,000 ms)
          if (waitMs > 28800000) {
            console.log(pc.red(`[Orchestrator] WARNING: API reset is scheduled for ${resetTime.toLocaleString()}. The process will pause for over 8 hours.`));
            console.log(pc.yellow(`[Orchestrator] You can safely terminate with Ctrl+C and restart manually after the reset time.`));
          }
          
          console.log(pc.cyan(`  › Pausing and will auto-resume at ${resetTime.toLocaleTimeString()}.`));
          updateStatus(statusFile, s => { s.phase = "waiting_for_reset"; });
          
          await new Promise(resolve => setTimeout(resolve, waitMs));
          
          console.log(pc.green(`[Orchestrator] Resuming step: ${name}`));
          updateStatus(statusFile, s => { s.phase = "running"; });
          
          // Construct the Resume Prompt
          const reasoningLogContent = readFileSync(reasoningLogFile, 'utf-8');
          const resumePrompt = `You are resuming an automated task that was interrupted by an API usage limit. Your progress up to the point of interruption has been saved. Your goal is to review your previous actions and continue the task from where you left off.

--- ORIGINAL INSTRUCTIONS ---
${fullPrompt}
--- END ORIGINAL INSTRUCTIONS ---

--- PREVIOUS ACTIONS LOG ---
${reasoningLogContent}
--- END PREVIOUS ACTIONS LOG ---

Please analyze the original instructions and your previous actions, then continue executing the plan to complete the step.`;
          
          // Update the prompt for the next iteration of the loop
          currentPrompt = resumePrompt;
          attempt--; // Do not count this as a formal "retry"
          continue; // Re-run the step with the new resume prompt
        }
      } else {
        // Graceful Fail Logic
        updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
        throw new Error(`Workflow failed: Claude AI usage limit reached. Your limit will reset at ${resetTime.toLocaleString()}.
To automatically wait and resume, set 'waitForRateLimitReset: true' in your claude.config.js.
You can re-run the command after the reset time to continue from this step.`);
      }
    }
    
    if (result.code !== 0) {
      updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
      throw new Error(`Step "${name}" failed. Check the output log for details: ${logFile}\nAnd the reasoning log: ${reasoningLogFile}`);
    }

    // Run the main check
    const checkResult = await runCheck(check, projectRoot);

    if (checkResult.success) {
      // Check passed - commit and return successfully
      console.log(`[Orchestrator] Committing checkpoint for step: ${name}`);
      execSync(`git add -A`, { stdio: "inherit", cwd: projectRoot });
      execSync(`git commit -m "chore(${name}): checkpoint"`, { stdio: "inherit", cwd: projectRoot });
      updateStatus(statusFile, s => { s.phase = "pending"; s.steps[name] = "done"; });
      return;
    }

    // Check failed - handle failure
    console.log(pc.red(`[Orchestrator] Check failed for step "${name}" (attempt ${attempt}/${maxRetries + 1})`));

    // If this is the final attempt, fail the step
    if (attempt > maxRetries) {
      updateStatus(statusFile, s => { s.phase = "failed"; s.steps[name] = "failed"; });
      throw new Error(`Step "${name}" failed after ${maxRetries} retries. Final check error: ${checkResult.output || 'Check validation failed'}`);
    }

    // Generate automatic feedback prompt for retry
    console.log(pc.yellow(`[Orchestrator] Generating  feedback for step: ${name}`));
    const checkDescription = Array.isArray(check) 
      ? 'One of the validation checks' 
      : `The validation check`;
        
    const feedbackPrompt = `Your previous attempt to complete the '${name}' step failed its validation check.

Here are the original instructions you were given for this step:
--- ORIGINAL INSTRUCTIONS ---
${fullPrompt}
--- END ORIGINAL INSTRUCTIONS ---

${checkDescription} failed with the following error output:
--- ERROR OUTPUT ---
${checkResult.output || 'No output captured'}
--- END ERROR OUTPUT ---

Please re-attempt the task. Your goal is to satisfy the **original instructions** while also fixing the error reported above. Analyze both the original goal and the specific failure. Do not modify the tests or checks.`;

    currentPrompt = feedbackPrompt;
  }
}

export async function runTask(taskRelativePath: string, pipelineOption?: string) {
  const config = await getConfig();
  if (!config) {
    throw new Error("Failed to load configuration.");
  }
  const projectRoot = getProjectRoot();
  console.log(pc.cyan(`Project root identified: ${projectRoot}`));

  // 1. Determine paths and check status FIRST.
  const taskId = path.basename(taskRelativePath, '.md').replace(/[^a-z0-9-]/gi, '-');
  const statusFile = path.resolve(projectRoot, config.statePath, `${taskId}.state.json`);
  mkdirSync(path.dirname(statusFile), { recursive: true });
  const status: TaskStatus = readStatus(statusFile);

  if (status.phase === 'done') {
    console.log(pc.green(`✔ Task "${taskId}" is already complete.`));
    console.log(pc.gray("  › To re-run, delete the state file and associated branch."));
    return;
  }

  // 2. Validate the pipeline configuration.
  const { isValid, errors } = validatePipeline(config, projectRoot);
  if (!isValid) {
    console.error(pc.red("✖ Pipeline configuration is invalid. Cannot run task.\n"));
    for (const error of errors) console.error(pc.yellow(`  - ${error}`));
    console.error(pc.cyan("\nPlease fix the errors or run 'claude-project validate' for details."));
    process.exit(1);
  }

  // 3. Ensure we are on the correct Git branch (now respects the user's config).
  const branchName = ensureCorrectGitBranch(config, projectRoot, taskRelativePath);

  // 4. Parse the task file to extract frontmatter
  const rawTaskContent = readFileSync(path.resolve(projectRoot, taskRelativePath), 'utf-8');
  const { pipeline: taskPipelineName, body: taskContent } = parseTaskFrontmatter(rawTaskContent);

  // 5. Determine which pipeline to use (priority: CLI option > task frontmatter > config default > first available)
  let selectedPipeline: PipelineStep[];
  let pipelineName: string;
  if (config.pipelines) {
    // New multi-pipeline format
    pipelineName = pipelineOption || taskPipelineName || config.defaultPipeline || Object.keys(config.pipelines)[0];
    if (!pipelineName || !config.pipelines[pipelineName]) {
      throw new Error(`Pipeline "${pipelineName}" not found in claude.config.js. Available: ${Object.keys(config.pipelines).join(', ')}`);
    }
    selectedPipeline = config.pipelines[pipelineName];

    // Log which source determined the pipeline selection
    if (pipelineOption) console.log(pc.cyan(`[Orchestrator] Using pipeline from --pipeline option: "${pipelineName}"`));
    else if (taskPipelineName) console.log(pc.cyan(`[Orchestrator] Using pipeline from task frontmatter: "${pipelineName}"`));
    else console.log(pc.cyan(`[Orchestrator] Using default pipeline: "${pipelineName}"`));
  } else {
    // Backward compatibility: old single pipeline format
    selectedPipeline = (config as any).pipeline;
    pipelineName = 'default'; // fallback name for legacy format
    if (pipelineOption) {
      console.log(pc.yellow(`[Orchestrator] Warning: --pipeline option ignored. Configuration uses legacy single pipeline format.`));
    }
  }

  // 6. Proceed with execution.
  updateStatus(statusFile, s => {
    if (s.taskId === 'unknown') s.taskId = taskId;
    s.branch = branchName;
    s.pipeline = pipelineName;
  });

  const logsDir = path.resolve(projectRoot, config.logsPath, taskId);
  mkdirSync(logsDir, { recursive: true });

  for (const [index, stepConfig] of selectedPipeline.entries()) {
    const { name, command, check } = stepConfig;
    const currentStepStatus = readStatus(statusFile);
    if (currentStepStatus.steps[name] === 'done') {
      console.log(pc.gray(`[Orchestrator] Skipping '${name}' (already done).`));
      continue;
    }

    // Automatically assemble context based on step position in pipeline
    const context: Record<string, string> = {};

    // Always include task definition
    context.taskDefinition = contextProviders.taskDefinition(projectRoot, taskContent);

    // Include plan content for any step after "plan"
    const planStepIndex = selectedPipeline.findIndex(step => step.name === 'plan');
    if (planStepIndex !== -1 && index > planStepIndex) {
      try {
        context.planContent = contextProviders.planContent(projectRoot, taskContent);
      } catch (error) {
        // If PLAN.md doesn't exist, skip including plan content
        console.log(pc.yellow(`[Orchestrator] Warning: Could not load plan content for step '${name}'. PLAN.md may not exist yet.`));
      }
    }

    // Read the specific command instructions for the current step
    const commandFilePath = path.resolve(projectRoot, '.claude', 'commands', `${command}.md`);
    const commandInstructions = readFileSync(commandFilePath, 'utf-8');

    // **REFACTORED PART**: Assemble the full prompt using the new function
    const fullPrompt = assemblePrompt(selectedPipeline, name, context, commandInstructions);

    const logFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.log`);
    const reasoningLogFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.reasoning.log`);
    const rawJsonLogFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.raw.json.log`);

    await executeStep(stepConfig, fullPrompt, statusFile, logFile, reasoningLogFile, rawJsonLogFile);
  }

  updateStatus(statusFile, s => { s.phase = 'done'; });
  console.log(pc.green("\n[Orchestrator] All steps completed successfully!"));
}