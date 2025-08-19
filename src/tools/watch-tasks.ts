import chokidar from "chokidar";
import { spawn } from "node:child_process";
import path from "node:path";
import pc from "picocolors";
import { getConfig, getProjectRoot } from "../config.js";

// Wrap the watcher logic in an exported function
export async function startWatcher() {
  const config = await getConfig();
  const projectRoot = getProjectRoot();
  if (!config) {
    throw new Error("Configuration is null. Cannot resolve task folder.");
  }
  const taskDir = path.resolve(projectRoot, config.taskFolder);

  console.log(pc.cyan(`Watching for new tasks in: ${taskDir}`));

  function run(taskPath: string) {
    console.log(pc.yellow(`\nNew task detected: ${path.basename(taskPath)}`));
    // We spawn a new process running `cat-herder run` to ensure each task
    // runs in a clean, independent state.
    const p = spawn("cat-herder", ["run", taskPath], {
      stdio: "inherit",
      // Run the new process from the user's project directory
      cwd: projectRoot,
    });
    p.on("close", (code) => console.log(pc.green(`[${path.basename(taskPath)}] watcher run finished with code ${code}`)));
  }

  chokidar.watch(`${taskDir}/*.md`, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 }
  }).on("add", (path: string) => run(path));
}
