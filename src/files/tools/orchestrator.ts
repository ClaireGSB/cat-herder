import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { glob } from "glob";
import { runStreaming } from "./proc.js";
import { updateStatus } from "./status.js";

/**
 * Generates a string representing the relevant project file structure.
 * This prevents our own tooling from polluting the AI's context.
 */
function getProjectStructure(): string {
  const ignore = [
    "node_modules/**", ".git/**", "dist/**", "tools/**",
    "state/**", "logs/**", ".husky/**", ".claude/**", "PLAN.md",
    "*.lock", "project-context.xml" // Also ignore lockfiles and context
  ];
  // Use `dot: true` to include dotfiles that aren't explicitly ignored
  const files = glob.sync("**/*", { ignore, nodir: true, dot: true });
  return files.length > 0 ? files.join("\n") : "This is a new project with no files yet.";
}

async function step(name: string, args: string[], log: string, check: () => void | Promise<void>) {
  console.log(`\n[Orchestrator] Starting step: ${name}`);
  updateStatus("state/current.state.json", s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });

  const code = await runStreaming("claude", ["--verbose", ...args], log);

  console.log(`[Orchestrator] Step "${name}" finished with exit code: ${code}`);
  if (code !== 0) {
    updateStatus("state/current.state.json", s => { s.phase = "failed"; s.steps[name] = "failed"; });
    throw new Error(`${name} failed`);
  }

  console.log(`[Orchestrator] Running checks for step: ${name}`);
  await check();

  console.log(`[Orchestrator] Committing checkpoint for step: ${name}`);
  execSync(`npx prettier --write .`, { stdio: 'inherit' });
  execSync(`git add -A && git commit -m "chore(${name}): checkpoint"`, { stdio: "inherit" });
  updateStatus("state/current.state.json", s => { s.phase = "done"; s.steps[name] = "done"; });
}

function testsShouldFail() { try { execSync("npm run test:ci", { stdio: "pipe" }); throw new Error("Tests passed unexpectedly"); } catch { return; } }
function testsShouldPass() { execSync("npm run test:ci", { stdio: "inherit" }); }

export async function runTask(taskPath: string) {
  execSync("mkdir -p state logs", { stdio: "ignore" });

  // --- Step 1: Plan ---
  // Assemble the prompt from building blocks.
  const rolePreamble = "You are an expert software engineer.";
  const projectStructure = getProjectStructure();
  const taskContent = readFileSync(taskPath, 'utf-8');
  const commandInstructions = readFileSync('.claude/commands/plan-task.md', 'utf-8');

  const finalPrompt = `
${rolePreamble}

--- PROJECT STRUCTURE ---
\`\`\`
${projectStructure}
\`\`\`

--- TASK DEFINITION ---
\`\`\`
${taskContent}
\`\`\`

--- YOUR INSTRUCTIONS ---
${commandInstructions}
  `;

  await step("plan", ["-p", finalPrompt], "logs/01-plan.log", () => {
    if (!existsSync("PLAN.md")) throw new Error("PLAN.md missing");
  });

  // --- Subsequent steps still use project commands for now ---
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

if (import.meta.url.startsWith('file:') && process.argv[1] === new URL(import.meta.url).pathname) {
    const task = process.argv[2];
    if (!task) {
        console.error("Usage: tsx tools/orchestrator.ts <path/to/task.md>");
        process.exit(1);
    }
    runTask(task).catch(e => { console.error(e); process.exit(1); });
}