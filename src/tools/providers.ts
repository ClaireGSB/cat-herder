import { readFileSync } from "node:fs";
import path from "node:path";
import { glob } from "glob";

/**
 * A map of context keys to functions that return the context data as a string.
 * This allows the orchestrator to dynamically build the context for each step.
 */
export const contextProviders: Record<string, (projectRoot: string, taskContent: string) => string> = {
  projectStructure: (projectRoot) => {
    const files = glob.sync("**/*", { 
      cwd: projectRoot, 
      ignore: ["node_modules/**", ".git/**", "dist/**", ".claude/**", "*.lock"], 
      nodir: true, 
      dot: true 
    });
    return files.join("\n");
  },
  taskDefinition: (_projectRoot, taskContent) => taskContent,
  planContent: (projectRoot) => {
    const planPath = path.join(projectRoot, "PLAN.md");
    // This provider assumes the file exists because the 'plan' step should have already created it.
    return readFileSync(planPath, 'utf-8');
  },
};