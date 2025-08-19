import { cosmiconfig } from "cosmiconfig";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { CheckConfig } from "./tools/check-runner.js";


// Define the structure of a pipeline step
export interface PipelineStep {
  name: string;
  command: string;
  model?: string;
  check: CheckConfig | CheckConfig[];
  fileAccess?: {
    allowWrite?: string[];
  };
  retry?: number;
}

type PipelinesMap = { [key: string]: PipelineStep[] };

// This is the type definition for the user's cat-herder.config.js file
export interface CatHerderConfig {
  taskFolder: string;
  statePath: string;
  logsPath: string;
  structureIgnore: string[];
  manageGitBranch?: boolean;
  autoCommit?: boolean;
  waitForRateLimitReset?: boolean;
  pipelines?: PipelinesMap;
  defaultPipeline?: string;
  // Backward compatibility - will be removed in future versions
  pipeline?: PipelineStep[];
}

// Default configuration if the user's file is missing parts
const defaultConfig: Omit<CatHerderConfig, "pipelines" | "defaultPipeline" | "pipeline"> = {
  taskFolder: "cat-herder-tasks",
  statePath: "~/.cat-herder/state",
  logsPath: "~/.cat-herder/logs",
  structureIgnore: [
    "node_modules/**", ".git/**", "dist/**", ".claude/**", "*.lock",
  ],
  manageGitBranch: true,
  autoCommit: false,
  waitForRateLimitReset: false,
};

let loadedConfig: CatHerderConfig | null = null;
let projectRoot: string | null = null;

export async function getConfig(): Promise<CatHerderConfig> {
  if (loadedConfig) return loadedConfig;

  const explorer = cosmiconfig("cat-herder");
  const result = await explorer.search();

  if (!result) {
    console.error("Error: Configuration file (cat-herder.config.js) not found.");
    console.error("Please run `cat-herder init` in your project root.");
    process.exit(1);
  }

  projectRoot = path.dirname(result.filepath);
  const userConfig = result.config as any;

  let pipelines: PipelinesMap = userConfig.pipelines || {};

  // Handle backward compatibility for the old `pipeline` array format
  if (userConfig.pipeline && Object.keys(pipelines).length === 0) {
    pipelines = { default: userConfig.pipeline };
  }
  
  let defaultPipeline = userConfig.defaultPipeline;
  // If no default is set, use the first pipeline as the default
  if (!defaultPipeline && Object.keys(pipelines).length > 0) {
    defaultPipeline = Object.keys(pipelines)[0];
  }
  
  const finalConfig: CatHerderConfig = { 
    ...defaultConfig, 
    ...userConfig,
    pipelines,
    defaultPipeline,
  };
  
  // Ensure data directories exist when using home directory paths
  if (finalConfig.statePath.startsWith('~')) {
    resolveDataPath(finalConfig.statePath);
  }
  if (finalConfig.logsPath.startsWith('~')) {
    resolveDataPath(finalConfig.logsPath);
  }

  // Clean up the old property if it exists
  delete (finalConfig as any).pipeline;

  loadedConfig = finalConfig;
  return loadedConfig;
}

// Utility to get the project root after config is loaded
export function getProjectRoot() {
  if (!projectRoot) {
    throw new Error("Project root not determined. Call getConfig() first.");
  }
  return projectRoot;
}

// Utility to resolve paths that may start with ~ (home directory)
export function resolveHomePath(inputPath: string): string {
  if (inputPath.startsWith('~/') || inputPath === '~') {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

// Utility to resolve state/logs paths with home directory support and ensure .cat-herder directory exists
export function resolveDataPath(inputPath: string, projectRoot?: string): string {
  const resolvedPath = resolveHomePath(inputPath);
  
  // If it's an absolute path (starts with ~ or /), use it directly
  if (path.isAbsolute(resolvedPath)) {
    // Ensure the parent directory exists and create .gitignore if needed
    ensureCatHerderDirectory(resolvedPath);
    return resolvedPath;
  }
  
  // Otherwise, resolve relative to project root
  if (!projectRoot) {
    throw new Error('Project root required for relative paths');
  }
  return path.resolve(projectRoot, resolvedPath);
}

// Utility to ensure .cat-herder directory exists and has .gitignore
function ensureCatHerderDirectory(fullPath: string): void {
  const catHerderDir = path.dirname(fullPath).includes('.cat-herder') 
    ? path.dirname(fullPath).split(path.sep).slice(0, -1).join(path.sep) + path.sep + '.cat-herder'
    : null;
    
  if (catHerderDir && catHerderDir.includes('.cat-herder')) {
    // Ensure .cat-herder directory exists
    if (!fs.existsSync(catHerderDir)) {
      fs.mkdirSync(catHerderDir, { recursive: true });
    }
    
    // Ensure .gitignore exists in .cat-herder directory
    const gitignorePath = path.join(catHerderDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '*\n', 'utf8');
    }
  }
}

// Utility to get a path to a command template inside the global package
export function getCommandTemplatePath(commandName: string): string {
    return path.resolve(new URL(`./dot-claude/commands/${commandName}`, import.meta.url).pathname);
}
