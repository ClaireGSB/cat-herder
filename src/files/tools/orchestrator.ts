import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { glob } from "glob";
import { runStreaming } from "./proc.js";
import { updateStatus } from "./status.js";

function getProjectStructure(): string {
  const ignore = [
    "node_modules/**", ".git/**", "dist/**", "tools/**",
    "state/**", "logs/**", ".husky/**", ".claude/**", "PLAN.md",
    "*.lock", "project-context.xml"
  ];
  const files = glob.sync("**/*", { ignore, nodir: true, dot: true });
  return files.length > 0 ? files.join("\n") : "This is a new project with no files yet.";
}

// NEW HELPER FUNCTION: Centralizes prompt creation logic
function createPrompt(commandFile: string, context: Record<string, string>): string {
  const rolePreamble = "You are an expert software engineer.";
  const commandInstructions = readFileSync(`.claude/commands/${commandFile}`, 'utf-8');

  let contextString = "";
  for (const [title, content] of Object.entries(context)) {
    contextString += `--- ${title.toUpperCase()} ---\n\`\`\`\n${content}\n\`\`\`\n\n`;
  }

  return `${rolePreamble}\n\n${contextString}--- YOUR INSTRUCTIONS ---\n${commandInstructions}`;
}

async function step(name: string, args: string[], log: string, check: () => void | Promise<void>) {
  console.log(`\n[Orchestrator] Starting step: ${name}`);
  updateStatus("state/current.state.json", s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });

  const code = await runStreaming("claude", ["--verbose", ...args], log);

  console.log(`[Orchestrator] Step "${name}" finished with exit code: ${code}`);
  if (code !== 0) {
    // --- NEW: ELEGANT ERROR HANDLING ---
    const output = readFileSync(log, 'utf-8');

    // Check for the specific usage limit error
    if (output.includes("Claude AI usage limit reached")) {
      const parts = output.split('|');
      // The timestamp is the second part
      const timestamp = parts.length > 1 ? parseInt(parts[1], 10) : null;
      
      let errorMessage = `[Orchestrator] ERROR: Claude AI usage limit reached.`;
      
      if (timestamp) {
        const resetDate = new Date(timestamp * 1000);
        errorMessage += `\n[Orchestrator] Your API quota will reset at: ${resetDate.toLocaleString()}`;
      }
      
      errorMessage += `\n[Orchestrator] Please wait and try again later.`;

      // Set a more appropriate status
      updateStatus("state/current.state.json", s => { s.phase = "interrupted"; s.steps[name] = "interrupted"; });
      throw new Error(errorMessage);
    }
    
    // Fallback for all other generic errors
    updateStatus("state/current.state.json", s => { s.phase = "failed"; s.steps[name] = "failed"; });
    throw new Error(`[Orchestrator] Step "${name}" failed with a generic error. Check the log file for details: ${log}`);
  }

  console.log(`[Orchestrator] Running checks for step: ${name}`);
  await check();

  console.log(`[Orchestrator] Committing checkpoint for step: ${name}`);
  try {
    execSync(`npx prettier --write . --log-level=error`, { stdio: 'inherit' });
  } catch (e) {
    console.warn("[Orchestrator] Prettier formatting failed, continuing anyway.");
  }
  execSync(`git add -A && git commit -m "chore(${name}): checkpoint"`, { stdio: "inherit" });
  updateStatus("state/current.state.json", s => { s.phase = "done"; s.steps[name] = "done"; });
}

function testsShouldFail() { try { execSync("npm run test:ci", { stdio: "pipe" }); throw new Error("Tests passed unexpectedly"); } catch { return; } }
function testsShouldPass() { execSync("npm run test:ci", { stdio: "inherit" }); }

export async function runTask(taskPath: string) {
  execSync("mkdir -p state logs", { stdio: "ignore" });

  const taskContent = readFileSync(taskPath, 'utf-8');

  // Step 1: Plan
  const planPrompt = createPrompt('plan-task.md', {
    'Project Structure': getProjectStructure(),
    'Task Definition': taskContent
  });
  await step("plan", ["-p", planPrompt], "logs/01-plan.log", () => {
    if (!existsSync("PLAN.md")) throw new Error("PLAN.md missing");
  });

  const planContent = readFileSync('PLAN.md', 'utf-8');

  // Step 2: Write Tests
  const writeTestsPrompt = createPrompt('write-tests.md', {
    'The Plan': planContent,
    'Original Task Definition': taskContent
  });
  await step("write_tests", ["-p", writeTestsPrompt], "logs/02-tests.log", async () => {
    const tests = await glob("test/**/*.{test,spec}.ts");
    if (!tests.length) throw new Error("No tests found");
    testsShouldFail();
  });
  
  // Step 3: Implement
  const implementPrompt = createPrompt('implement.md', {
    'The Plan': planContent,
    // Note: We could also add the content of the failing test files to the context here
  });
  await step("implement", ["-p", implementPrompt], "logs/03-implement.log", () => { testsShouldPass(); });

  // Subsequent steps are simplified
  const docsPrompt = createPrompt('docs-update.md', {});
  await step("docs", ["-p", docsPrompt], "logs/04-docs.log", () => {});

  const reviewPrompt = createPrompt('self-review.md', {});
  await step("review", ["-p", reviewPrompt], "logs/05-review.log", () => {});

  // TODO: Uncomment below when PR creation is implemented

  // const prPrompt = createPrompt('push-pr.md', {});
  // await step("pr", ["-p", prPrompt], "logs/06-pr.log", () => {});
}

if (import.meta.url.startsWith('file:') && process.argv[1] === new URL(import.meta.url).pathname) {
    const task = process.argv[2];
    if (!task) {
        console.error("Usage: tsx tools/orchestrator.ts <path/to/task.md>");
        process.exit(1);
    }
    runTask(task).catch(e => { console.error(e); process.exit(1); });
}