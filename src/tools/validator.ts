import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { ClaudeProjectConfig } from "../config.js";
import { contextProviders } from "./providers.js";

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
 * Validates a pipeline configuration against available commands and providers.
 * @returns A ValidationResult object with validation status, errors, and missing permissions.
 */
export function validatePipeline(config: ClaudeProjectConfig, projectRoot: string): ValidationResult {
  const errors: string[] = [];
  const missingPermissions: string[] = []; // New array for fixable errors
  const knownContextKeys = Object.keys(contextProviders);
  const validCheckTypes = ["none", "fileExists", "shell"];

  // 1. Load settings.json permissions
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
    errors.push(".claude/settings.json not found. Please run `claude-project init` to create a default one.");
  }

  // 2. Load user-defined scripts from package.json
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

  // 2. Validate pipelines structure
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
    return { isValid: false, errors, missingPermissions: [] };
  }

  // 3. Loop through each pipeline and validate its steps
  for (const [pipelineName, pipeline] of Object.entries(pipelines)) {
    if (!Array.isArray(pipeline)) {
      errors.push(`Pipeline "${pipelineName}" is not a valid array of steps.`);
      continue;
    }

    for (const [index, step] of pipeline.entries()) {
      const stepId = `Pipeline '${pipelineName}', Step ${index + 1} ('${step.name || 'unnamed'}')`;

      // --- Basic Step Structure Validation ---
      if (!step.name) {
        errors.push(`${stepId}: is missing the 'name' property.`);
      }
      if (!step.command) {
        errors.push(`${stepId}: is missing the 'command' property.`);
        continue;
      }
      if (!step.check || !step.check.type) {
        errors.push(`${stepId}: is missing a valid 'check' object with a 'type' property.`);
        continue;
      }

      if (step.check?.type === "shell" && step.check.command) {
        const command = step.check.command;
        // We specifically look for npm script commands
        if (command.startsWith("npm ")) {
          // e.g., "npm test" -> "test", "npm run lint" -> "lint"
          const scriptName = command.split(" ").pop();
          if (scriptName && !userScripts[scriptName]) {
            errors.push(
              `${stepId}: The command "${command}" requires a script named "${scriptName}" in your package.json, but it was not found.`
            );
          }
        }
      }

      // --- Command File and Permission Validation ---
      const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
      if (!fs.existsSync(commandFilePath)) {
        errors.push(`${stepId}: Command file not found at .claude/commands/${step.command}.md`);
      } else {
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

      // --- Context validation removed - context is now handled automatically by the orchestrator ---
      
      // --- Retry Validation ---
      if (step.retry !== undefined) {
        if (typeof step.retry !== 'number' || !Number.isInteger(step.retry) || step.retry < 0) {
          errors.push(`${stepId}: The 'retry' property must be a non-negative integer, but found '${step.retry}'.`);
        }
      }

      // --- Check Validation ---
      if (!validCheckTypes.includes(step.check.type)) {
        errors.push(`${stepId}: Invalid check type '${step.check.type}'. Available: ${validCheckTypes.join(", ")}`);
      }
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
