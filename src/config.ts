import { cosmiconfig } from "cosmiconfig";
import path from "node:path";
import { CheckConfig } from "./tools/check-runner.js";

// Define the structure of a pipeline step
export interface PipelineStep {
  name: string;
  command: string;
  check: CheckConfig;
  fileAccess?: {
    allowWrite?: string[];
  };
}

// This is the type definition for the user's claude.config.js file
export interface ClaudeProjectConfig {
  taskFolder: string;
  statePath: string;
  logsPath: string;
  structureIgnore: string[];
  manageGitBranch?: boolean;
  pipeline: PipelineStep[];
}

// Default configuration if the user's file is missing parts
const defaultConfig: ClaudeProjectConfig = {
  taskFolder: "claude-Tasks",
  statePath: ".claude/state",
  logsPath: ".claude/logs",
  structureIgnore: [
    "node_modules/**", ".git/**", "dist/**", ".claude/**", "*.lock",
  ],
  manageGitBranch: true,
  pipeline: [],
};

let loadedConfig: ClaudeProjectConfig | null = null;
let projectRoot: string | null = null;

export async function getConfig() {
  if (loadedConfig) return loadedConfig;

  const explorer = cosmiconfig("claude");
  const result = await explorer.search();

  if (!result) {
    console.error("Error: Configuration file (claude.config.js) not found.");
    console.error("Please run `claude-project init` in your project root.");
    process.exit(1);
  }

  projectRoot = path.dirname(result.filepath);
  loadedConfig = { ...defaultConfig, ...result.config };
  return loadedConfig;
}

// Utility to get the project root after config is loaded
export function getProjectRoot() {
  if (!projectRoot) {
    throw new Error("Project root not determined. Call getConfig() first.");
  }
  return projectRoot;
}

// Utility to get a path to a command template inside the global package
export function getCommandTemplatePath(commandName: string): string {
    return path.resolve(new URL(`./dot-claude/commands/${commandName}`, import.meta.url).pathname);
}
