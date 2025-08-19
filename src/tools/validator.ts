import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { ClaudeProjectConfig } from "../config.js";
import { contextProviders } from "./providers.js";

// Valid Claude model names for validation
const VALID_CLAUDE_MODELS = [
  "claude-opus-4-1-20250805",
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-3-5-haiku-20241022",
];

/**
 * A simple utility to parse YAML frontmatter from a markdown file.
 * @param content The string content of the markdown file.
 * @returns The parsed frontmatter as an object, or null if not found.
 */
function parseFrontmatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\s*([\s\S]+?)\s*---/);
  if (match) {
    try {
      return yaml.load(match[1]) as Record<string, any>;
    } catch {
      // If YAML is malformed, treat it as if there's no frontmatter.
      return null;
    }
  }
  return null;
}

// The new return type for our function
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  missingPermissions: string[];
}

/**
 * Validates top-level configuration properties.
 */
function validateTopLevelConfig(config: ClaudeProjectConfig, errors: string[]): void {
  if (config.manageGitBranch !== undefined && typeof config.manageGitBranch !== 'boolean') {
    errors.push(`Top-level config error: 'manageGitBranch' must be a boolean (true or false).`);
  }
  if (config.taskFolder !== undefined && typeof config.taskFolder !== 'string') {
    errors.push(`Top-level config error: 'taskFolder' must be a string.`);
  }
  if (config.statePath !== undefined && typeof config.statePath !== 'string') {
    errors.push(`Top-level config error: 'statePath' must be a string.`);
  }
  if (config.logsPath !== undefined && typeof config.logsPath !== 'string') {
    errors.push(`Top-level config error: 'logsPath' must be a string.`);
  }
  if (config.structureIgnore !== undefined && !Array.isArray(config.structureIgnore)) {
    errors.push(`Top-level config error: 'structureIgnore' must be an array of strings.`);
  }
  if (config.defaultPipeline !== undefined && typeof config.defaultPipeline !== 'string') {
    errors.push(`Top-level config error: 'defaultPipeline' must be a string.`);
  }
}

/**
 * Loads project settings and scripts from .claude/settings.json and package.json.
 * @returns Object containing allowedPermissions and userScripts, or null if critical files are missing.
 */
function loadProjectSettings(projectRoot: string, errors: string[]): { allowedPermissions: string[], userScripts: Record<string, string> } | null {
  // Load settings.json permissions
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  let allowedPermissions: string[] = [];
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      allowedPermissions = settings?.permissions?.allow || [];
    } catch {
      errors.push("Could not parse .claude/settings.json. Please ensure it is valid JSON.");
    }
  } else {
    errors.push(".claude/settings.json not found. Please run `cat-herder init` to create a default one.");
  }

  // Load user-defined scripts from package.json
  const pkgPath = path.join(projectRoot, "package.json");
  let userScripts: Record<string, string> = {};
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      userScripts = pkg.scripts || {};
    } catch {
      errors.push("Could not parse package.json. Please ensure it is valid JSON.");
    }
  } else {
    errors.push("A package.json file was not found in the project root.");
  }

  return { allowedPermissions, userScripts };
}

/**
 * Validates the pipeline structure and handles both new and legacy formats.
 * @returns The normalized pipelines object or null if invalid.
 */
function validatePipelineStructure(config: ClaudeProjectConfig, errors: string[]): { [key: string]: any[] } | null {
  let pipelines: { [key: string]: any[] };
  
  if (config.pipelines && typeof config.pipelines === 'object' && Object.keys(config.pipelines).length > 0) {
    // New multi-pipeline format
    pipelines = config.pipelines;
    
    // Validate defaultPipeline if specified
    if (config.defaultPipeline && !config.pipelines[config.defaultPipeline]) {
      errors.push(`The defaultPipeline "${config.defaultPipeline}" is not defined in the 'pipelines' object.`);
    }
  } else if ((config as any).pipeline && Array.isArray((config as any).pipeline)) {
    // Backward compatibility: old single pipeline format
    pipelines = { default: (config as any).pipeline };
  } else {
    errors.push("Configuration is missing a 'pipelines' object with at least one defined pipeline, or a legacy 'pipeline' array.");
    return null;
  }

  // Validate each pipeline is an array
  for (const [pipelineName, pipeline] of Object.entries(pipelines)) {
    if (!Array.isArray(pipeline)) {
      errors.push(`Pipeline "${pipelineName}" is not a valid array of steps.`);
    }
  }

  return pipelines;
}

/**
 * Validates a single check object within a step.
 */
function validateCheckObject(check: any, checkId: string, userScripts: Record<string, string>, errors: string[]): void {
  const validCheckTypes = ["none", "fileExists", "shell"];

  if (!check || !check.type) {
    errors.push(`${checkId}: is missing a valid 'check' object with a 'type' property.`);
    return;
  }

  if (!validCheckTypes.includes(check.type)) {
    errors.push(`${checkId}: Invalid check type '${check.type}'. Available: ${validCheckTypes.join(", ")}`);
  }

  // Validate npm script commands for shell checks
  if (check.type === "shell" && check.command) {
    const command = check.command;
    // We specifically look for npm script commands
    if (typeof command === 'string' && command.startsWith("npm ")) {
      // e.g., "npm test" -> "test", "npm run lint" -> "lint"
      const scriptName = command.split(" ").pop();
      if (scriptName && !userScripts[scriptName]) {
        errors.push(
          `${checkId}: The command "${command}" requires a script named "${scriptName}" in your package.json, but it was not found.`
        );
      }
    }
  }

  // Deepen Check Object Validation
  switch (check.type) {
    case 'fileExists':
      if (typeof check.path !== 'string' || !check.path) {
        errors.push(`${checkId}: Check type 'fileExists' requires a non-empty 'path' string property.`);
      }
      break;
    case 'shell':
      if (typeof check.command !== 'string' || !check.command) {
        errors.push(`${checkId}: Check type 'shell' requires a non-empty 'command' string property.`);
      }
      if (check.expect && !['pass', 'fail'].includes(check.expect)) {
        errors.push(`${checkId}: The 'expect' property for a shell check must be either "pass" or "fail".`);
      }
      break;
  }
}

/**
 * Validates the fileAccess property of a step.
 */
function validateFileAccess(fileAccess: any, stepId: string, errors: string[]): void {
  if (fileAccess === undefined) {
    return; // fileAccess is optional
  }

  if (typeof fileAccess !== 'object' || fileAccess === null || Array.isArray(fileAccess)) {
    errors.push(`${stepId}: The 'fileAccess' property must be an object.`);
    return;
  }

  if (fileAccess.allowWrite) {
    if (!Array.isArray(fileAccess.allowWrite)) {
      errors.push(`${stepId}: The 'fileAccess.allowWrite' property must be an array of strings.`);
    } else {
      fileAccess.allowWrite.forEach((pattern: any, i: number) => {
        if (typeof pattern !== 'string' || !pattern) {
          errors.push(`${stepId}: The 'fileAccess.allowWrite' array contains an invalid value at index ${i}. All values must be non-empty strings.`);
        }
      });
    }
  }
}

/**
 * Validates permissions for a command file.
 */
function validatePermissions(commandFilePath: string, stepId: string, allowedPermissions: string[], errors: string[], missingPermissions: string[]): void {
  if (!fs.existsSync(commandFilePath)) {
    errors.push(`${stepId}: Command file not found at ${commandFilePath.replace(process.cwd() + '/', '')}`);
    return;
  }

  const commandContent = fs.readFileSync(commandFilePath, 'utf-8');
  const frontmatter = parseFrontmatter(commandContent);
  const toolsValue = frontmatter?.['allowed-tools'];
  
  let requiredTools: string[] = [];

  if (typeof toolsValue === 'string') {
    requiredTools = toolsValue.split(',').map(tool => tool.trim()).filter(Boolean); // filter(Boolean) removes empty strings
  } else if (Array.isArray(toolsValue)) {
    requiredTools = toolsValue;
  }
  
  for (const tool of requiredTools) {
    if (tool && !allowedPermissions.includes(tool)) {
      // Instead of just a generic error, we add to both arrays
      const errorMessage = `${stepId}: Requires missing permission "${tool}"`;
      errors.push(errorMessage);
      missingPermissions.push(tool); // Add to the structured list
    }
  }
}

/**
 * Validates a single step within a pipeline.
 */
function validateStep(
  step: any, 
  stepIndex: number, 
  pipelineName: string, 
  userScripts: Record<string, string>, 
  allowedPermissions: string[], 
  projectRoot: string,
  errors: string[], 
  missingPermissions: string[]
): void {
  const stepId = `Pipeline '${pipelineName}', Step ${stepIndex + 1} ('${step.name || 'unnamed'}')`;

  // Basic Step Structure Validation
  if (!step.name) {
    errors.push(`${stepId}: is missing the 'name' property.`);
  }
  if (!step.command) {
    errors.push(`${stepId}: is missing the 'command' property.`);
    return;
  }
  if (!step.check) {
    errors.push(`${stepId}: is missing a 'check' property.`);
    return;
  }

  // Handle both single check and array of checks
  const checksToValidate = Array.isArray(step.check) ? step.check : [step.check];
  
  for (const [checkIndex, singleCheck] of checksToValidate.entries()) {
    const checkId = Array.isArray(step.check) 
      ? `${stepId}, check #${checkIndex + 1}` 
      : stepId;

    validateCheckObject(singleCheck, checkId, userScripts, errors);
  }

  // Command File and Permission Validation
  const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
  validatePermissions(commandFilePath, stepId, allowedPermissions, errors, missingPermissions);

  // Retry Validation
  if (step.retry !== undefined) {
    if (typeof step.retry !== 'number' || !Number.isInteger(step.retry) || step.retry < 0) {
      errors.push(`${stepId}: The 'retry' property must be a non-negative integer, but found '${step.retry}'.`);
    }
  }

  // FileAccess Validation
  validateFileAccess(step.fileAccess, stepId, errors);

  // Model Validation
  if (step.model !== undefined) {
    if (typeof step.model !== 'string') {
      errors.push(`${stepId}: The 'model' property must be a string.`);
    } else if (!VALID_CLAUDE_MODELS.includes(step.model)) {
      errors.push(`${stepId}: Invalid model name "${step.model}". Available models are: ${VALID_CLAUDE_MODELS.join(", ")}`);
    }
  }
}

/**
 * Validates a pipeline configuration against available commands and providers.
 * @returns A ValidationResult object with validation status, errors, and missing permissions.
 */
export function validatePipeline(config: ClaudeProjectConfig, projectRoot: string): ValidationResult {
  const errors: string[] = [];
  const missingPermissions: string[] = [];

  // Top-Level Config Validation
  validateTopLevelConfig(config, errors);

  // Load project settings and scripts
  const settings = loadProjectSettings(projectRoot, errors);
  if (!settings) {
    return { isValid: false, errors, missingPermissions: [] };
  }
  const { allowedPermissions, userScripts } = settings;

  // Validate pipelines structure
  const pipelines = validatePipelineStructure(config, errors);
  if (!pipelines) {
    return { isValid: false, errors, missingPermissions: [] };
  }

  // Loop through each pipeline and validate its steps
  for (const [pipelineName, pipeline] of Object.entries(pipelines)) {
    if (!Array.isArray(pipeline)) {
      continue; // Error already added in validatePipelineStructure
    }

    for (const [index, step] of pipeline.entries()) {
      validateStep(step, index, pipelineName, userScripts, allowedPermissions, projectRoot, errors, missingPermissions);
    }
  }

  // Use a Set to remove duplicate missing permissions before returning
  const uniqueMissingPermissions = [...new Set(missingPermissions)];

  return { 
    isValid: errors.length === 0, 
    errors,
    missingPermissions: uniqueMissingPermissions,
  };
}
