import yaml from 'js-yaml';
import fs from 'node:fs';
import { PipelineStep, getPromptTemplatePath } from "../../config.js";

/**
 * Parses YAML frontmatter from a task file to extract pipeline configuration.
 * @param content The raw content of the task file.
 * @returns An object containing the pipeline name and autonomy level (if specified) and the task body without frontmatter.
 */
export function parseTaskFrontmatter(content: string): { pipeline?: string; autonomyLevel?: number; body: string } {
  const match = content.match(/^---\s*([\s\S]+?)\s*---/);
  if (match) {
    try {
      const frontmatter = yaml.load(match[1]) as Record<string, any> | undefined;
      const body = content.substring(match[0].length).trim();
      
      let autonomyLevel = frontmatter?.autonomyLevel;
      if (frontmatter?.interactionThreshold !== undefined) {
        console.log("⚠️  Warning: 'interactionThreshold' in task frontmatter is deprecated. Please rename it to 'autonomyLevel'.");
        autonomyLevel = frontmatter.interactionThreshold;
      }
      
      return { 
        pipeline: frontmatter?.pipeline, 
        autonomyLevel,
        body 
      };
    } catch {
      return { body: content };
    }
  }
  return { body: content };
}

/**
 * Gets the appropriate autonomy instructions based on the autonomy level.
 * @param autonomyLevel The autonomy level (0-5)
 * @returns The formatted autonomy instructions or empty string if autonomyLevel is 0
 */
function getInteractionIntro(autonomyLevel: number): string {
  if (autonomyLevel === 0) return '';

  const templatePath = getPromptTemplatePath('interaction-intro.md');
  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  
  let instructions = '';
  if (autonomyLevel <= 2) { // Maximum/Balanced autonomy
    const match = templateContent.match(/<!-- AUTONOMY_LEVEL_MAXIMUM -->(.*?)<!--/s);
    instructions = match ? match[1].trim() : '';
  } else if (autonomyLevel <= 4) { // Balanced autonomy
    const match = templateContent.match(/<!-- AUTONOMY_LEVEL_BALANCED -->(.*?)<!--/s);
    instructions = match ? match[1].trim() : '';
  } else { // Guided/Low autonomy
    const match = templateContent.match(/<!-- AUTONOMY_LEVEL_GUIDED -->(.*?)<!--/s);
    instructions = match ? match[1].trim() : '';
  }
  
  const commonMatch = templateContent.match(/<!-- COMMON_INSTRUCTIONS -->(.*)/s);
  const commonInstructions = commonMatch ? commonMatch[1].trim() : '';
  
  let intro = (instructions + '\n\n' + commonInstructions).trim();
  intro = intro.replace(/%%AUTONOMY_LEVEL%%/g, String(autonomyLevel));
  
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
 * @param autonomyLevel - The autonomy level (0-5) that controls when AI should ask for human input.
 * @returns The fully assembled prompt string to be sent to Claude.
 */
export function assemblePrompt(
  pipeline: PipelineStep[],
  currentStepName: string,
  context: Record<string, string>,
  commandInstructions: string,
  autonomyLevel: number = 0,
  sequenceFolderPath?: string
): string {
  // 1. Explain that the task is part of a larger, multi-step process.
  let intro = `Here is a task that has been broken down into several steps. You are an autonomous agent responsible for completing one step at a time.`;

  // 2. Add autonomy level instructions
  const interactionIntro = getInteractionIntro(autonomyLevel);

  if (sequenceFolderPath) {
    intro += `\n\nYou are currently running a task from a folder in "${sequenceFolderPath}". In this task, whenever the "sequence folder" or "sequence directory" is mentionned, it is referring to the "${sequenceFolderPath}" folder.`;
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