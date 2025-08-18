import fs from "node:fs";
import path from "node:path";
import { getConfig, getProjectRoot } from "../config.js";

// Wrap the status logic in an exported function
export async function showStatus() {
  const config = await getConfig();
  const projectRoot = getProjectRoot();
  if (!config) {
    console.log("Configuration not found.");
    return;
  }
  const stateDir = path.resolve(projectRoot, config.statePath);

  if (!fs.existsSync(stateDir)) {
    console.log("No status to show. State directory not found.");
    return;
  }
  
  const files = fs.readdirSync(stateDir).filter(f => f.endsWith(".state.json"));
  
  if (files.length === 0) {
    console.log("No status to show. No tasks found in state directory.");
    return;
  }

  // Show the most recent status
   files.sort((a, b) => {
      return fs.statSync(path.join(stateDir, b)).mtime.getTime() - fs.statSync(path.join(stateDir, a)).mtime.getTime();
  });
  const latestFile = files[0];
  const s = JSON.parse(fs.readFileSync(path.join(stateDir, latestFile), "utf8"));
  
  console.log(JSON.stringify(s, null, 2));
}
