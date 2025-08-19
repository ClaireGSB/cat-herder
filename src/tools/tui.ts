import blessed from "blessed";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { getConfig, getProjectRoot, resolveDataPath } from "../config.js";

// Wrap the TUI logic in an exported function
export async function startTui() {
  const config = await getConfig();
  const projectRoot = getProjectRoot();
  if (!config) {
    throw new Error("Configuration is missing. Please ensure the config is properly set.");
  }
  const stateDir = resolveDataPath(config.statePath, projectRoot);

  const screen = blessed.screen({ smartCSR: true });
  screen.title = "Claude Project Status";

  const box = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    border: "line",
    label: " Claude Task Status ",
    content: "Waiting for task data...",
    style: {
      fg: 'white',
      border: { fg: 'cyan' },
    },
    tags: true, // Enable tags for colored text
  });

  screen.append(box);

  function render() {
    if (!fs.existsSync(stateDir)) {
      box.setContent("State directory not found. Run a task to begin.");
      screen.render();
      return;
    }

    const files = fs.readdirSync(stateDir).filter(f => f.endsWith(".state.json"));
    if (files.length === 0) {
      box.setContent("No tasks found in the state directory.");
      screen.render();
      return;
    }

    // For now, we'll just show the most recently updated task
    files.sort((a, b) => {
        return fs.statSync(path.join(stateDir, b)).mtime.getTime() - fs.statSync(path.join(stateDir, a)).mtime.getTime();
    });
    const latestFile = files[0];
    
    try {
        const s = JSON.parse(fs.readFileSync(path.join(stateDir, latestFile), "utf8"));
        const steps = Object.entries(s.steps || {}).map(([k,v]) => `  - ${k}: {yellow-fg}${v}{/yellow-fg}`).join("\n");
        const content = `
{bold}Task ID:{/bold}   ${s.taskId}
{bold}Phase:{/bold}     {cyan-fg}${s.phase}{/cyan-fg}
{bold}Current:{/bold}   ${s.currentStep}

{bold}Steps:{/bold}
${steps}

{bold}Last Update:{/bold} ${new Date(s.lastUpdate).toLocaleString()}
        `;
        box.setContent(content);
    } catch {
        box.setContent(`Error reading state file: ${latestFile}`);
    }
    screen.render();
  }

  console.log(pc.cyan("Starting Terminal UI... Press 'q' or 'Ctrl+C' to quit."));
  
  // Initial render
  render();
  // Update every second
  setInterval(render, 1000);

  screen.key(["q", "C-c"], () => {
    return process.exit(0);
  });

  screen.render();
}
