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
  const currentStepConfig = config.pipeline.find(step => step.name === status.currentStep);
  if (!currentStepConfig) {
    block(`Error: Could not find step "${status.currentStep}" in claude.config.js pipeline.`);
    return;
  }

  // 5. Enforce the rules
  const allowedPatterns = currentStepConfig.fileAccess?.allowWrite;
  if (!allowedPatterns || allowedPatterns.length === 0) {
    process.exit(0); // No rules for this step, so allow the write
  }

  const isAllowed = allowedPatterns.some(pattern => minimatch(filePathToEdit, pattern, { dot: true }));

  if (!isAllowed) {
    block(`Blocked: The '${status.currentStep}' step only allows writing to paths matching: [${allowedPatterns.join(", ")}]. Action on '${filePathToEdit}' denied.`);
  }

  // If we reach here, the path is allowed
  process.exit(0);
}

main().catch(e => {
  block(`An unexpected error occurred in the pipeline validator: ${e.message}`);
});
