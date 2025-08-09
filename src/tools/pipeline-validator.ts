#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { minimatch } from "minimatch";
import { cosmiconfig } from "cosmiconfig";
import type { ClaudeProjectConfig, PipelineStep } from "../config.js";
import type { TaskStatus } from "./status.js";

// Helper to block the tool with a clear error message
function block(message: string) {
  process.stderr.write(`[Guardrail] ${message}\n`);
  process.exit(2); // Exit with a non-zero code to signal failure
}

// Convert glob patterns to human-readable descriptions
function explainPattern(pattern: string): string {
  if (pattern === "**/*") return "any file in any directory";
  if (pattern.startsWith("src/**/*.")) return `${pattern.split('.').pop()?.toUpperCase()} files in the src directory`;
  if (pattern.startsWith("**/*.")) return `${pattern.split('.').pop()?.toUpperCase()} files anywhere`;
  if (pattern.startsWith("*/") && pattern.endsWith("/*")) return `files in any subdirectory of ${pattern.slice(2, -2)}`;
  if (pattern.includes("**")) return `files matching pattern: ${pattern}`;
  return `files matching: ${pattern}`;
}

// Find suggested alternative paths based on the attempted file path
function suggestAlternatives(attemptedPath: string, allowedPatterns: string[]): string[] {
  const suggestions: string[] = [];
  const fileExt = path.extname(attemptedPath);
  const fileName = path.basename(attemptedPath);
  const dirName = path.dirname(attemptedPath);

  for (const pattern of allowedPatterns) {
    // If same file extension is allowed elsewhere
    if (fileExt && pattern.includes(`*${fileExt}`)) {
      const suggestedDir = pattern.replace(/\/\*\*\/\*.*$/, '').replace(/\*.*$/, '');
      if (suggestedDir && suggestedDir !== dirName) {
        suggestions.push(`${suggestedDir}/${fileName}`);
      }
    }
    
    // If the pattern allows files in a specific directory
    if (pattern.includes('**/*') && !pattern.includes('.')) {
      const allowedDir = pattern.replace('/**/*', '');
      suggestions.push(`${allowedDir}/${fileName}`);
    }
  }

  return [...new Set(suggestions)].slice(0, 3); // Return up to 3 unique suggestions
}

// Create a comprehensive error message with helpful guidance
function createHelpfulErrorMessage(
  attemptedPath: string,
  currentStep: string,
  allowedPatterns: string[],
  projectRoot: string
): string {
  const relativePath = path.isAbsolute(attemptedPath) 
    ? path.relative(projectRoot, attemptedPath)
    : attemptedPath;

  let message = `🚫 File Access Denied\n\n`;
  message += `Attempted to write: ${relativePath}\n`;
  message += `Current pipeline step: "${currentStep}"\n\n`;
  
  message += `📋 This step only allows writing to:\n`;
  allowedPatterns.forEach(pattern => {
    message += `  • ${explainPattern(pattern)} (${pattern})\n`;
  });

  const suggestions = suggestAlternatives(relativePath, allowedPatterns);
  if (suggestions.length > 0) {
    message += `\n💡 Suggested alternatives:\n`;
    suggestions.forEach(suggestion => {
      message += `  • ${suggestion}\n`;
    });
  }

  if (path.isAbsolute(attemptedPath)) {
    message += `\n⚠️  You used an absolute path. Try using a relative path from the project root instead.\n`;
  }

  message += `\n🔧 Next steps:\n`;
  message += `  • Move to the appropriate pipeline step that allows this file access\n`;
  message += `  • Modify your approach to work within the current step's constraints\n`;
  message += `  • Update the pipeline configuration if this restriction is too limiting\n`;

  return message;
}

// Main validation logic
async function main() {
  // 1. Read the tool input payload from stdin
  const input = fs.readFileSync(0, "utf8"); // Synchronous and reliable
  if (!input) return; // No input, nothing to do

  const payload = JSON.parse(input);
  const filePathToEdit = payload?.tool_input?.file_path;

  // We only care about file-writing tools that provide a path
  if (!filePathToEdit) {
    process.exit(0);
  }

  // 2. Load the user's configuration using cosmiconfig
  const explorer = cosmiconfig("claude");
  const result = await explorer.search();
  if (!result || !result.config) {
    block("Error: Could not load claude.config.js to check file access rules.");
    return;
  }
  const config = result.config as ClaudeProjectConfig;
  const projectRoot = path.dirname(result.filepath);

  // 3. Find the most recent task state to know the current step
  const stateDir = path.resolve(projectRoot, config.statePath);
  if (!fs.existsSync(stateDir)) process.exit(0); // No state dir, no rules yet

  const stateFiles = fs.readdirSync(stateDir)
    .filter(f => f.endsWith(".state.json"))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(stateDir, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (stateFiles.length === 0) process.exit(0); // No state files, no rules yet

  const latestStateFile = path.join(stateDir, stateFiles[0].name);
  const status: TaskStatus = JSON.parse(fs.readFileSync(latestStateFile, "utf8"));
  
  // 4. Find the current step's rules in the pipeline
  // 4.1. Get the active pipeline name from the status file.
  const activePipelineName = status.pipeline || config.defaultPipeline || 'default';
  
  // 4.2. Select the correct pipeline from the config.
  const activePipeline = config.pipelines?.[activePipelineName] || (config as any).pipeline;
  if (!activePipeline) {
    block(`Error: Could not find active pipeline "${activePipelineName}" in config.`);
    return;
  }
  
  // 4.3. Find the current step within THAT specific pipeline.
  const currentStepConfig = activePipeline.find((step: PipelineStep) => step.name === status.currentStep);
  
  if (!currentStepConfig) {
    block(`Error: Could not find step "${status.currentStep}" in pipeline "${activePipelineName}".`);
    return;
  }

  const allowedPatterns = currentStepConfig.fileAccess?.allowWrite;
  if (!allowedPatterns || allowedPatterns.length === 0) {
    process.exit(0);
  }

  const isAllowed: boolean = allowedPatterns.some((pattern: string): boolean => minimatch(filePathToEdit, pattern, { dot: true }));

  if (!isAllowed) {
    const helpfulMessage = createHelpfulErrorMessage(
      filePathToEdit,
      status.currentStep,
      allowedPatterns,
      projectRoot
    );
    block(helpfulMessage);
  }

  process.exit(0);
}

main().catch(e => {
  block(`An unexpected error occurred in the pipeline validator: ${e instanceof Error ? e.message : String(e)}`);
});