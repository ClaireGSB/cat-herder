import fs from "fs";
import path from "path";
import { ClaudeProjectConfig } from "../config.js";
import { contextProviders } from "./providers.js";

/**
 * Validates a pipeline configuration against available commands and providers.
 * @returns An object with an `isValid` boolean and an array of error strings.
 */
export function validatePipeline(config: ClaudeProjectConfig, projectRoot: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const knownContextKeys = Object.keys(contextProviders);
  const validCheckTypes = ["none", "fileExists", "shell"];

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