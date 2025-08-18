import yaml from 'js-yaml';
import { PipelineStep } from "../../config.js";

/**
 * Parses YAML frontmatter from a task file to extract pipeline configuration.
 * @param content The raw content of the task file.
 * @returns An object containing the pipeline name (if specified) and the task body without frontmatter.
 */
export function parseTaskFrontmatter(content: string): { pipeline?: string; body: string } {
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
export function assemblePrompt(
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