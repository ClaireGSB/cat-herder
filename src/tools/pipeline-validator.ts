#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { minimatch } from 'minimatch';

interface FileAccessConfig {
  allowWrite?: string[];
}

interface PipelineStep {
  name: string;
  command: string;
  context: string[];
  check: any;
  fileAccess?: FileAccessConfig;
}

interface Config {
  statePath: string;
  pipeline: PipelineStep[];
}

interface TaskState {
  currentStep: string;
}

function readStdin(): string {
  const stdin = process.stdin;
  stdin.setEncoding('utf8');
  
  let data = '';
  stdin.on('readable', () => {
    const chunk = stdin.read();
    if (chunk !== null) {
      data += chunk;
    }
  });
  
  stdin.on('end', () => {
    // Data is ready
  });
  
  // For synchronous reading in Node.js
  try {
    return readFileSync('/dev/stdin', 'utf8');
  } catch (error) {
    console.error('Error reading from stdin:', error);
    process.exit(1);
  }
}

function findMostRecentStateFile(statePath: string): string | null {
  try {
    if (!existsSync(statePath)) {
      return null;
    }
    
    const files = readdirSync(statePath)
      .filter(file => file.endsWith('.state.json'))
      .map(file => ({
        name: file,
        path: join(statePath, file),
        mtime: statSync(join(statePath, file)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    return files.length > 0 ? files[0].path : null;
  } catch (error) {
    return null;
  }
}

async function loadConfig(): Promise<Config | null> {
  try {
    const configPath = resolve('./claude.config.js');
    if (!existsSync(configPath)) {
      return null;
    }
    
    // Use dynamic import for ES modules
    const configModule = await import(`file://${configPath}`);
    return configModule.default || configModule;
  } catch (error) {
    return null;
  }
}

function loadTaskState(stateFilePath: string): TaskState | null {
  try {
    const stateContent = readFileSync(stateFilePath, 'utf8');
    return JSON.parse(stateContent);
  } catch (error) {
    return null;
  }
}

async function main() {
  // Read the file path from stdin
  const input = readStdin().trim();
  let filePathData: { file_path: string };
  
  try {
    filePathData = JSON.parse(input);
  } catch (error) {
    console.error('Error parsing JSON from stdin:', error);
    process.exit(1);
  }
  
  const filePath = filePathData.file_path;
  
  // Load configuration
  const config = await loadConfig();
  if (!config) {
    console.error('Error: Could not load claude.config.js');
    process.exit(1);
  }
  
  // Find most recent state file
  const stateFilePath = findMostRecentStateFile(config.statePath);
  if (!stateFilePath) {
    console.error('Error: Could not find any .state.json files in', config.statePath);
    process.exit(1);
  }
  
  // Load task state
  const taskState = loadTaskState(stateFilePath);
  if (!taskState) {
    console.error('Error: Could not parse state file:', stateFilePath);
    process.exit(1);
  }
  
  // Find current step in pipeline
  const currentStep = config.pipeline.find(step => step.name === taskState.currentStep);
  if (!currentStep) {
    console.error(`Error: Current step '${taskState.currentStep}' not found in pipeline`);
    process.exit(1);
  }
  
  // Check if step has fileAccess configuration
  if (!currentStep.fileAccess || !currentStep.fileAccess.allowWrite) {
    // No restrictions - allow the write
    process.exit(0);
  }
  
  // Check if file path matches any allowed patterns
  const allowedPatterns = currentStep.fileAccess.allowWrite;
  const isAllowed = allowedPatterns.some(pattern => minimatch(filePath, pattern));
  
  if (isAllowed) {
    process.exit(0);
  } else {
    console.error(`Blocked: The current step '${taskState.currentStep}' only allows file modifications matching [${allowedPatterns.map(p => `"${p}"`).join(', ')}]. Action on '${filePath}' denied.`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});