import express, { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { getConfig, getProjectRoot } from "../config.js";

// Wrap the server logic in an exported function
export async function startWebServer() {
  const config = await getConfig();
  const projectRoot = getProjectRoot();
  if (!config) {
    throw new Error("Configuration is null. Please ensure the configuration is properly loaded.");
  }
  const stateDir = path.resolve(projectRoot, config.statePath);

  const app = express();

  app.get("/", (_req: Request, res: Response) => {
    if (!fs.existsSync(stateDir)) {
      return res.status(404).send("State directory not found. Have you run a task yet?");
    }

    const files = fs.readdirSync(stateDir).filter(f => f.endsWith(".state.json"));
    if (files.length === 0) {
      return res.send("<h1>Claude Tasks</h1><p>No tasks found.</p>");
    }

    const rows = files.map(f => {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(stateDir, f), "utf8"));
        return `<tr><td>${s.taskId || 'N/A'}</td><td>${s.currentStep || 'N/A'}</td><td>${s.phase || 'N/A'}</td><td>${s.lastUpdate || 'N/A'}</td></tr>`;
      } catch {
        return `<tr><td colspan="4">Error reading state file: ${f}</td></tr>`;
      }
    }).join("");

    res.send(`<!doctype html><html><head><title>Claude Tasks Status</title><meta http-equiv="refresh" content="5"></head><body><h1>Claude Tasks</h1><table border="1" cellpadding="5" cellspacing="0"><thead><tr><th>Task</th><th>Current Step</th><th>Phase</th><th>Last Updated</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  });

  const port = 5177;
  app.listen(port, () => {
    console.log(pc.green(`Status web server running.`));
    console.log(pc.cyan(`›› Open http://localhost:${port} in your browser.`));
  });
}
