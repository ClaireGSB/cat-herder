import yaml from 'js-yaml';
import fs from 'node:fs';
import { PipelineStep, getPromptTemplatePath } from "../../config.js";

/**
 * Parses YAML frontmatter from a task file to extract pipeline configuration.
 * @param content The raw content of the task file.
 * @returns An object containing the pipeline name and interaction threshold (if specified) and the task body without frontmatter.
 */
export function parseTaskFrontmatter(content: string): { pipeline?: string; interactionThreshold?: number; body: string } {
  const match = content.match(/^---\s*([\s\S]+?)\s*---/);
  if (match) {
    try {
      const frontmatter = yaml.load(match[1]) as Record<string, any> | undefined;
      const body = content.substring(match[0].length).trim();
      return { 
        pipeline: frontmatter?.pipeline, 
        interactionThreshold: frontmatter?.interactionThreshold,
        body 
      };
    } catch {
      return { body: content };
    }
  }
  return { body: content };
}

/**
 * Gets the appropriate interaction instructions based on the threshold level.
 * @param threshold The interaction threshold (0-5)
 * @returns The formatted interaction instructions or empty string if threshold is 0
 */
function getInteractionIntro(threshold: number): string {
  if (threshold === 0) return '';

  const templatePath = getPromptTemplatePath('interaction-intro.md');
  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  
  let instructions = '';
  if (threshold <= 2) { // Low
    const match = templateContent.match(/<!-- INTERACTION_LEVEL_LOW -->(.*?)<!--/s);
    instructions = match ? match[1].trim() : '';
  } else if (threshold <= 4) { // Medium
    const match = templateContent.match(/<!-- INTERACTION_LEVEL_MEDIUM -->(.*?)<!--/s);
    instructions = match ? match[1].trim() : '';
  } else { // High
    const match = templateContent.match(/<!-- INTERACTION_LEVEL_HIGH -->(.*?)<!--/s);
    instructions = match ? match[1].trim() : '';
  }
  
  const commonMatch = templateContent.match(/<!-- COMMON_INSTRUCTIONS -->(.*)/s);
  const commonInstructions = commonMatch ? commonMatch[1].trim() : '';
  
  let intro = (instructions + '\n\n' + commonInstructions).trim();
  intro = intro.replace(/%%INTERACTION_THRESHOLD%%/g, String(threshold));
  
  return intro;
}

/**
 * Assembles the complete prompt for Claude for a given pipeline step.
 * It provides context about the entire workflow and the current step.
 *
 * @param pipeline - The entire pipeline configuration array.
 * @param currentStepName - The `name` of the step Claude is currently executing.
 * @param context - A record of contextual information (e.g., task definition, plan content).
 * @param commandInstructions - The specific instructions loaded from the command markdown file.
 * @param interactionThreshold - The interaction threshold (0-5) that controls when AI should ask for human input.
 * @returns The fully assembled prompt string to be sent to Claude.
 */
export function assemblePrompt(
  pipeline: PipelineStep[],
  currentStepName: string,
  context: Record<string, string>,
  commandInstructions: string,
  interactionThreshold: number = 0,
  sequenceFolderPath?: string
): string {
  // 1. Explain that the task is part of a larger, multi-step process.
  let intro = `Here is a task that has been broken down into several steps. You are an autonomous agent responsible for completing one step at a time.`;

  // 2. Add interaction threshold instructions
  const interactionIntro = getInteractionIntro(interactionThreshold);

  if (sequenceFolderPath) {
    intro += `\n\nYou are currently running a task from a folder in "${sequenceFolderPath}". In this prompt, when referring to the sequence folder, use this path.`;
  }

  // 3. Provide the entire pipeline definition as a simple numbered list.
  const pipelineStepsList = pipeline.map((step, index) => `${index + 1}. ${step.name}`).join('\n');
  const pipelineContext = `This is the full pipeline for your awareness:\n${pipelineStepsList}`;

  // 4. Clearly state which step Claude is responsible for right now.
  const responsibility = `You are responsible for executing step "${currentStepName}".`;

  // 5. Assemble the specific context data required for this step.
  let contextString = "";
  for (const [title, content] of Object.entries(context)) {
    contextString += `--- ${title.toUpperCase()} ---\n\
\
\
${content.trim()}\n\
\
\
\
\
\n`;
  }

  if (contextString) { // Check if there's any context left to display
    contextString = contextString.trim();
  }


  // 6. Combine all parts into the final prompt.
  return [
    intro,
    interactionIntro,
    pipelineContext,
    responsibility,
    contextString,
    `--- YOUR INSTRUCTIONS FOR THE "${currentStepName}" STEP ---`,
    commandInstructions,
  ]
    .filter(Boolean) // Remove any empty strings
    .join("\n\n");
}