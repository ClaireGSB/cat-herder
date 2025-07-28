import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { glob } from "glob";
import { runStreaming } from "./proc.js";
import { updateStatus } from "./status.js";

async function step(name: string, args: string[], log: string, check: () => void | Promise<void>) {
  updateStatus("state/current.state.json", s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });
  const code = await runStreaming("claude", ["-p", ...args], log);
  if (code !== 0) { updateStatus("state/current.state.json", s => { s.phase = "failed"; s.steps[name] = "failed"; }); throw new Error(`${name} failed`); }
  await check();
  execSync(`git add -A && git commit -m "chore(${name}): checkpoint"`, { stdio: "inherit" });
  updateStatus("state/current.state.json", s => { s.phase = "done"; s.steps[name] = "done"; });
}

function testsShouldFail() { try { execSync("npm run test:ci", { stdio: "pipe" }); throw new Error("Tests passed unexpectedly"); } catch { return; } }
function testsShouldPass() { execSync("npm run test:ci", { stdio: "inherit" }); }

export async function runTask(taskPath: string) {
  execSync("mkdir -p state logs", { stdio: "ignore" });
  await step("plan", ["/project:plan-task", taskPath], "logs/01-plan.log", () => { if (!existsSync("PLAN.md")) throw new Error("PLAN.md missing"); });
  await step("write_tests", ["/project:write-tests", taskPath], "logs/02-tests.log", async () => {
    const tests = await glob("test/**/*.{test,spec}.ts");
    if (!tests.length) throw new Error("No tests found");
    testsShouldFail();
  });
  await step("implement", ["/project:implement"], "logs/03-implement.log", () => { testsShouldPass(); });
  await step("docs", ["/project:docs-update"], "logs/04-docs.log", () => {});
  await step("review", ["/project:self-review"], "logs/05-review.log", () => { execSync("npm run lint:fix || true", { stdio: "inherit" }); });
  await step("pr", ["/project:push-pr"], "logs/06-pr.log", () => {});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const task = process.argv[2];
  if (!task) throw new Error("Usage: tsx tools/orchestrator.ts <task.md>");
  runTask(task).catch(e => { console.error(e); process.exit(1); });
}