import { readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { updateStatus, readStatus } from "../status.js";
import { getConfig, getProjectRoot, PipelineStep, resolveDataPath } from "../../config.js";
import { contextProviders } from "../providers.js";
import { taskPathToTaskId } from "../../utils/id-generation.js";
import { parseTaskFrontmatter, assemblePrompt } from "./prompt-builder.js";
import { executeStep } from "./step-runner.js";

/**
 * Executes the pipeline for a given task without Git branch management.
 * This function contains the core pipeline execution logic that can be reused
 * by both runTask and runTaskSequence.
 *
 * @param taskPath Absolute path to the task file
 * @param options Options to control behavior
 */
export async function executePipelineForTask(
  taskPath: string,
  options: {
    skipGitManagement?: boolean;
    pipelineOption?: string;
    sequenceStatusFile?: string;
    sequenceFolderPath?: string;
  } = {}
): Promise<void> {
  const config = await getConfig();
  if (!config) {
    throw new Error("Failed to load configuration.");
  }
  const projectRoot = getProjectRoot();

  // Parse the task file to extract frontmatter
  const rawTaskContent = readFileSync(taskPath, 'utf-8');
  const { pipeline: taskPipelineName, autonomyLevel: taskAutonomyLevel, body: taskContent } = parseTaskFrontmatter(rawTaskContent);

  // Determine task ID and status file path
  const taskId = taskPathToTaskId(taskPath, projectRoot);
  const resolvedStatePath = resolveDataPath(config.statePath, projectRoot);
  const statusFile = path.join(resolvedStatePath, `${taskId}.state.json`);
  mkdirSync(path.dirname(statusFile), { recursive: true });

  // Determine which pipeline to use (priority: option > task frontmatter > config default > first available)
  let selectedPipeline: PipelineStep[];
  let pipelineName: string;
  if (config.pipelines) {
    // New multi-pipeline format
    pipelineName = options.pipelineOption || taskPipelineName || config.defaultPipeline || Object.keys(config.pipelines)[0];
    if (!pipelineName || !config.pipelines[pipelineName]) {
      throw new Error(`Pipeline "${pipelineName}" not found in cat-herder.config.js. Available: ${Object.keys(config.pipelines).join(', ')}`);
    }
    selectedPipeline = config.pipelines[pipelineName];

    // Log which source determined the pipeline selection
    if (options.pipelineOption) console.log(pc.cyan(`[Orchestrator] Using pipeline from option: "${pipelineName}"`));
    else if (taskPipelineName) console.log(pc.cyan(`[Orchestrator] Using pipeline from task frontmatter: "${pipelineName}"`));
    else console.log(pc.cyan(`[Orchestrator] Using default pipeline: "${pipelineName}"`));
  } else {
    // Backward compatibility: old single pipeline format
    selectedPipeline = (config as any).pipeline;
    pipelineName = 'default'; // fallback name for legacy format
    if (options.pipelineOption) {
      console.log(pc.yellow(`[Orchestrator] Warning: pipeline option ignored. Configuration uses legacy single pipeline format.`));
    }
  }

  // Resolve interaction threshold (priority: task frontmatter > config > default 0)
  const resolvedAutonomyLevel = taskAutonomyLevel ?? config.autonomyLevel ?? 0;

  // Extract sequence ID if this task is part of a sequence
  const sequenceId = options.sequenceStatusFile
    ? path.basename(options.sequenceStatusFile, '.state.json')
    : undefined;

  // Update status with pipeline information (branch will be set by caller if needed)
  const relativeTaskPath = path.relative(projectRoot, taskPath);
  updateStatus(statusFile, s => {
    if (s.taskId === 'unknown') {
      s.taskId = taskId;
      s.startTime = new Date().toISOString();
    }
    s.taskPath = relativeTaskPath; // Ensure taskPath is always set
    s.pipeline = pipelineName;
    if (sequenceId) {
      s.parentSequenceId = sequenceId; // Explicitly set the link
    }
  });

  const resolvedLogsPath = resolveDataPath(config.logsPath, projectRoot);
  const logsDir = path.join(resolvedLogsPath, taskId);
  mkdirSync(logsDir, { recursive: true });

  for (const [index, stepConfig] of selectedPipeline.entries()) {
    const { name, command, check } = stepConfig;
    // Read the current status at the beginning of each step iteration
    const currentTaskStatus = readStatus(statusFile);
    if (currentTaskStatus.steps[name] === 'done') {
      console.log(pc.gray(`[Orchestrator] Skipping '${name}' (already done).`));
      continue;
    }

    // Automatically assemble context based on step position in pipeline
    const context: Record<string, string> = {};

    // Always include task definition 
    context.taskDefinition = contextProviders.taskDefinition(config, projectRoot, currentTaskStatus, taskContent);

    // Include plan content for any step after "plan" 
    const planStepIndex = selectedPipeline.findIndex(step => step.name === 'plan');
    if (planStepIndex !== -1 && index > planStepIndex) {
      try {
        context.planContent = contextProviders.planContent(config, projectRoot, currentTaskStatus, taskContent);
      } catch (error) {
        // If PLAN.md doesn't exist, skip including plan content
        console.log(pc.yellow(`[Orchestrator] Warning: Could not load plan content for step '${name}'. PLAN.md may not exist yet.`));
      }
    }

    // NEW: Include human interaction history for all steps
    const interactionHistory = contextProviders.interactionHistory(config, projectRoot, currentTaskStatus, taskContent);
    if (interactionHistory) { // Only add if there's actual history
      context.interactionHistory = interactionHistory;
    }

    // Read the specific command instructions for the current step
    // Resolve command prompt: prefer new neutral location, fallback to legacy path
    let commandFilePath = path.resolve(projectRoot, '.cat-herder', 'steps', `${command}.md`);
    if (!existsSync(commandFilePath)) {
      commandFilePath = path.resolve(projectRoot, '.claude', 'commands', `${command}.md`);
    }
    const commandInstructions = readFileSync(commandFilePath, 'utf-8');

    // Assemble the full prompt using the assemblePrompt function
    const fullPrompt = assemblePrompt(
      selectedPipeline,
      name,
      context,
      commandInstructions,
      resolvedAutonomyLevel,
      options.sequenceFolderPath
    );

    const logFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.log`);
    const reasoningLogFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.reasoning.log`);
    const rawJsonLogFile = path.join(logsDir, `${String(index + 1).padStart(2, '0')}-${name}.raw.json.log`);

    await executeStep(stepConfig, fullPrompt, statusFile, logFile, reasoningLogFile, rawJsonLogFile, pipelineName, options.sequenceStatusFile);
  }

  updateStatus(statusFile, s => { s.phase = 'done'; });
  console.log(pc.green("\n[Orchestrator] All steps completed successfully!"));
}
