import chokidar from "chokidar";
import { spawn } from "node:child_process";

function run(taskPath: string) {
  const p = spawn("tsx", ["tools/orchestrator.ts", taskPath], { stdio: "inherit" });
  p.on("close", (code) => console.log(`[${taskPath}] finished with ${code}`));
}

chokidar.watch("claude-Tasks/*.md", { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 500 } })
  .on("add", (path: string) => run(path));