import { readFileSync } from "node:fs";
import path from "node:path";
import { glob } from "glob";
import { CatHerderConfig } from "../config.js";
import { TaskStatus } from "../types.js";

/**
 * A map of context keys to functions that return the context data as a string.
 * This allows the orchestrator to dynamically build the context for each step.
 */
export const contextProviders: Record<string, (config: CatHerderConfig, projectRoot: string, taskStatus: TaskStatus, originalTaskContent: string) => string> = {
  taskDefinition: (_config, _projectRoot, _taskStatus, originalTaskContent) => originalTaskContent,
  planContent: (_config, projectRoot, _taskStatus, _originalTaskContent) => {
    const planPath = path.join(projectRoot, "PLAN.md");
    try {
      return readFileSync(planPath, 'utf-8');
    } catch {
      return '';
    }
  },
  interactionHistory: (_config, _projectRoot, taskStatus, _originalTaskContent) => {
    if (!taskStatus.interactionHistory || taskStatus.interactionHistory.length === 0) {
      return '';
    }

    let historyString = "--- HUMAN INTERACTION HISTORY ---\n";
    taskStatus.interactionHistory.forEach((interaction, index) => {
      historyString += `\n**Interaction #${index + 1} (${new Date(interaction.timestamp).toLocaleString()})**\n`;
      historyString += `**Q:** ${interaction.question}\n`;
      historyString += `**A:** ${interaction.answer}\n`;
    });
    historyString += "--- END HUMAN INTERACTION HISTORY ---";
    return historyString;
  }
};