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
    errors.push(".claude/settings.json not found. Please run `claude-project init` to create a default one.");
  }

  if (!config.pipeline || !Array.isArray(config.pipeline)) {
    errors.push("Configuration is missing a valid 'pipeline' array.");
    return { isValid: false, errors };
  }

  for (const [index, step] of config.pipeline.entries()) {
    const stepNum = index + 1;

    if (!step.command) {
        errors.push(`Step ${stepNum} ('${step.name}'): is missing the 'command' property.`);
        continue; // Skip further checks for this malformed step
    }

    const commandFilePath = path.join(projectRoot, ".claude", "commands", `${step.command}.md`);
    if (!fs.existsSync(commandFilePath)) {
      errors.push(`Step ${stepNum} ('${step.name}'): Command file not found at .claude/commands/${step.command}.md`);
    } else {
      // Perform permission check
      const commandContent = fs.readFileSync(commandFilePath, 'utf-8');
      const frontmatter = parseFrontmatter(commandContent);
      const requiredTools: string[] = frontmatter?.['allowed-tools'] || [];
      
      for (const tool of requiredTools) {
        // Simple exact match check for permissions
        if (!allowedPermissions.includes(tool)) {
          errors.push(`Step ${stepNum} ('${step.name}'): Command requires tool "${tool}", which is not listed in the "allow" section of .claude/settings.json.`);
        }
      }
    }

    for (const contextKey of step.context) {
      if (!knownContextKeys.includes(contextKey)) {
        errors.push(`Step ${stepNum} ('${step.name}'): Unknown context provider '${contextKey}'. Available: ${knownContextKeys.join(", ")}`);
      }
    }
    
    if (!step.check || !step.check.type) {
        errors.push(`Step ${stepNum} ('${step.name}'): is missing a valid 'check' object with a 'type' property.`);
        continue;
    }

    if (!validCheckTypes.includes(step.check.type)) {
      errors.push(`Step ${stepNum} ('${step.name}'): Invalid check type '${step.check.type}'. Available: ${validCheckTypes.join(", ")}`);
    }
  }

  return { isValid: errors.length === 0, errors };
}