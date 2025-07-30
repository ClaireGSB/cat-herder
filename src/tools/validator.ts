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

  if (!config.pipeline || !Array.isArray(config.pipeline)) {
    errors.push("Configuration is missing a valid 'pipeline' array.");
    return { isValid: false, errors, missingPermissions: [] };
  }

  // 2. Loop through each step in the pipeline
  for (const [index, step] of config.pipeline.entries()) {
    const stepNum = index + 1;

    // --- Basic Step Structure Validation ---
    if (!step.command) {
        errors.push(`Step ${stepNum} ('${step.name}'): is missing the 'command' property.`);
        continue;
    }
    if (!step.check || !step.check.type) {
        errors.push(`Step ${stepNum} ('${step.name}'): is missing a valid 'check' object with a 'type' property.`);
        continue;
    }

    // --- Command File and Permission Validation ---
    const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
    if (!fs.existsSync(commandFilePath)) {
      errors.push(`Step ${stepNum} ('${step.name}'): Command file not found at .claude/commands/${step.command}.md`);
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
          const errorMessage = `Step ${stepNum} ('${step.name}'): Requires missing permission "${tool}"`;
          errors.push(errorMessage);
          missingPermissions.push(tool); // Add to the structured list
        }
      }
    }

    // --- Context validation removed - context is now handled automatically by the orchestrator ---
    
    // --- Check Validation ---
    if (!validCheckTypes.includes(step.check.type)) {
      errors.push(`Step ${stepNum} ('${step.name}'): Invalid check type '${step.check.type}'. Available: ${validCheckTypes.join(", ")}`);
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
