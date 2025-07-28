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

/**
 * Validates a pipeline configuration against available commands and providers.
 * @returns An object with an `isValid` boolean and an array of error strings.
 */
export function validatePipeline(config: ClaudeProjectConfig, projectRoot: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
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
    return { isValid: false, errors };
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
        if (!allowedPermissions.includes(tool)) {
          errors.push(`Step ${stepNum} ('${step.name}'): Command requires tool "${tool}", which is not listed in the "allow" section of .claude/settings.json.`);
        }
      }
    }

    // --- Context Validation ---
    for (const contextKey of step.context) {
      if (!knownContextKeys.includes(contextKey)) {
        errors.push(`Step ${stepNum} ('${step.name}'): Unknown context provider '${contextKey}'. Available: ${knownContextKeys.join(", ")}`);
      }
    }
    
    // --- Check Validation ---
    if (!validCheckTypes.includes(step.check.type)) {
      errors.push(`Step ${stepNum} ('${step.name}'): Invalid check type '${step.check.type}'. Available: ${validCheckTypes.join(", ")}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}
