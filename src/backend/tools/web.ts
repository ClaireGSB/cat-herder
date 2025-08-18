import express from "express";
import path from "node:path";
import pc from "picocolors";
import { createServer } from 'node:http';
import { getConfig, getProjectRoot } from "../config.js";
import { createRouter } from "./web/routes.js";
import { setupWebSockets } from "./web/websockets.js";


export async function startWebServer() {
  const config = await getConfig();
  const projectRoot = getProjectRoot();
  const stateDir = path.resolve(projectRoot, config.statePath);
  const logsDir = path.resolve(projectRoot, config.logsPath);

  const app = express();
  const server = createServer(app);
  
  // Serve Vue SPA static files
  const frontendDistPath = path.resolve(projectRoot, "src/frontend/dist");
  app.use(express.static(frontendDistPath));

  // Use the router from routes.ts
  app.use(createRouter(stateDir, logsDir, config));

  // Catch-all handler for client-side routing - must be after API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });

  // Set up WebSockets from websockets.ts
  setupWebSockets(server, stateDir, logsDir);

  const port = 5177;
  server.listen(port, () => {
    console.log(pc.green(`Status web server running.`));
    console.log(pc.cyan(`›› Open http://localhost:${port} in your browser.`));
  });
}