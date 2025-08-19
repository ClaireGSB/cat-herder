import express from "express";
import path from "node:path";
import pc from "picocolors";
import { createServer } from 'node:http';
import { getConfig, getProjectRoot, resolveDataPath } from "../config.js";
import { createRouter } from "./web/routes.js";
import { setupWebSockets } from "./web/websockets.js";
import { fileURLToPath } from "node:url"; 

// Define an interface for the options
interface WebServerOptions {
  stateDir?: string;
  logsDir?: string;
}

export async function startWebServer(options: WebServerOptions = {}) {
  const config = await getConfig();
  const projectRoot = getProjectRoot();

  // Use the paths from options if they exist, otherwise fall back to the config
  const stateDir = options.stateDir || resolveDataPath(config.statePath, projectRoot);
  const logsDir = options.logsDir || resolveDataPath(config.logsPath, projectRoot);

  const app = express();
  const server = createServer(app);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Our build script now copies `templates` and `public` into the *same directory*
  // as this running file (__dirname). So, the path is simple and direct.
  const viewsPath = path.join(__dirname, 'templates', 'web');
  const publicPath = path.join(__dirname, 'public');

  app.set("view engine", "ejs");
  app.set("views", viewsPath);
  app.use(express.static(publicPath));

  // Use the router from routes.ts
  app.use(createRouter(stateDir, logsDir, config));

  // Set up WebSockets from websockets.ts
  setupWebSockets(server, stateDir, logsDir);

  const port = 5177;
  server.listen(port, () => {
    // Add a check to show if we're in test mode
    if (options.stateDir) {
      console.log(pc.inverse(pc.yellow(" RUNNING IN TEST MODE ")));
    }
    console.log(pc.green(`Status web server running.`));
    console.log(pc.cyan(`›› Open http://localhost:${port} in your browser.`));
  });
}