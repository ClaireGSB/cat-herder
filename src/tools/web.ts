import express from "express";
import path from "node:path";
import pc from "picocolors";
import { createServer } from 'node:http';
import { getConfig, getProjectRoot, resolveDataPath } from "../config.js";
import { createRouter } from "./web/routes.js";
import { setupWebSockets } from "./web/websockets.js";


export async function startWebServer() {
  const config = await getConfig();
  const projectRoot = getProjectRoot();
  const stateDir = resolveDataPath(config.statePath, projectRoot);
  const logsDir = resolveDataPath(config.logsPath, projectRoot);

  const app = express();
  const server = createServer(app);
  
  app.set("view engine", "ejs");
  app.set("views", path.resolve(new URL("../templates/web", import.meta.url).pathname));
  app.use(express.static(path.resolve(new URL("../public", import.meta.url).pathname)));

  // Use the router from routes.ts
  app.use(createRouter(stateDir, logsDir, config));

  // Set up WebSockets from websockets.ts
  setupWebSockets(server, stateDir, logsDir);

  const port = 5177;
  server.listen(port, () => {
    console.log(pc.green(`Status web server running.`));
    console.log(pc.cyan(`›› Open http://localhost:${port} in your browser.`));
  });
}