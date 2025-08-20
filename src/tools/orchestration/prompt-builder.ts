import yaml from 'js-yaml';
import { PipelineStep } from "../../config.js";

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
  interactionThreshold: number = 0
): string {
  // 1. Explain that the task is part of a larger, multi-step process.
  const intro = `Here is a task that has been broken down into several steps. You are an autonomous agent responsible for completing one step at a time.`;

  // 2. Add interaction threshold instructions
  const interactionIntro = `You are operating at an interaction threshold of ${interactionThreshold}/5. A threshold of 0 means you must never ask for clarification. A threshold of 5 means you must use the \`askHuman(question: string)\` tool whenever you face a choice or ambiguity. Scale your use of this tool accordingly. When you use \`askHuman\`, your work will pause until a human provides an answer.`;

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