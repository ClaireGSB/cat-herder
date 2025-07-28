# PLAN.md

## Implementation Checklist

### Phase 1: Bootstrap CLI Repository
- [x] Create `package.json` with dependencies (commander, fs-extra, picocolors, tsx, typescript)
- [x] Create `tsconfig.json` for ESM build
- [x] Implement `src/utils/pkg.ts` with safe JSON merge
- [x] Add `bin` entry to `package.json`
- [x] Implement `src/index.ts` using Commander with `init` command
- [x] Implement `src/init.ts` that copies templates and merges package.json
- [x] Test: `npm run build` outputs `dist/` and `npx ./dist/index.js init --help` prints usage

### Phase 2: Provide Templates
#### Claude Settings & Commands
- [x] Create `src/files/dot-claude/settings.json` with PreToolUse and PostToolUse hooks
- [x] Create `src/files/dot-claude/commands/plan-task.md`
- [x] Create `src/files/dot-claude/commands/write-tests.md`
- [x] Create `src/files/dot-claude/commands/implement.md`
- [x] Create `src/files/dot-claude/commands/docs-update.md`
- [x] Create `src/files/dot-claude/commands/self-review.md`
- [x] Create `src/files/dot-claude/commands/push-pr.md`

#### Configuration Files
- [x] Create `src/files/configs/.eslintrc.cjs`
- [x] Create `src/files/configs/.prettierrc.json`
- [x] Create `src/files/configs/tsconfig.json` (for target repos)

#### Sample Task
- [x] Create `src/files/tasks/sample.md`

#### Git Hooks
- [x] Create `src/files/husky/pre-commit`
- [x] Create `src/files/husky/pre-push`

### Phase 3: Implement Orchestrator and Helpers
- [x] Create `src/files/tools/proc.ts` for streaming subprocess output
- [x] Create `src/files/tools/status.ts` for atomic status and events logging
- [x] Create `src/files/tools/validators.ts` for PreToolUse blocking based on state
- [x] Create `src/files/tools/orchestrator.ts` for step machine and validations
- [x] Create `src/files/tools/status-cli.ts` for quick status visibility
- [x] Create `src/files/tools/tui.ts` for terminal UI
- [x] Create `src/files/tools/web.ts` for minimal Express web view

### Phase 4: Watcher and Run Commands
- [x] Create `src/files/tools/watch-tasks.ts` using chokidar
- [x] Ensure all npm scripts are added via init.ts package.json merge

### Phase 5: Husky Hooks Implementation
- [x] Verify pre-commit hook runs lint-staged
- [x] Verify pre-push hook runs test:ci
- [x] Test hooks block commits/pushes on failures

### Phase 6: QA Testing
- [x] Test `npx claude-project init` in fresh TS repo
- [x] Test `npm run claude:run claude-Tasks/task-001-sample.md`
- [x] Verify TUI and web interfaces work
- [x] Confirm step checkpoints, commits, logs, status work
- [x] Verify PR creation works
- [x] Fix any discovered defects
- [x] If test repo has been created, remove it

### Phase 7: Documentation and Publish locally
- [x] Write comprehensive README with install, usage, troubleshooting
- [x] use npm link to "publish" so that user can test the package locally.
- [ ] Final end-to-end testing

### Definition of Done Checklist
- [ ] CLI compiles and runs without errors
- [ ] Templates copy correctly without overwriting existing files
- [ ] Orchestrator executes all six steps in correct order
- [ ] Git commits happen at each checkpoint with proper messages
- [ ] Status tracking works and persists across interruptions
- [ ] PreToolUse validator blocks out-of-order edits reliably
- [ ] Git hooks enforce tests and lint on push
- [ ] TUI and web view show live step and phase information
- [ ] Sample task completes end-to-end and opens draft PR
- [ ] Type checking passes: `npx tsc --noEmit`

---

## Objective

Build a reusable CLI named `claude-project` that you can run inside any TypeScript repository to scaffold a Claude Code based, step-gated automation workflow with:

- Custom slash commands per phase
- A strict external orchestrator that runs Claude headless one step at a time
- Hooks that block out-of-order edits and enforce tests and style
- Persistent status and logs for crash-safe resume and observability
- Minimal terminal TUI and minimal web view for status

## Scope

- Local-only operation. No remote runner and no GitHub Actions in v1.
- Hard-coded sequence for v1: plan → write tests → implement → docs → self review → open PR.
- Supports npm and Vitest by default. ESLint and Prettier included.
- Templates and scripts are copied into the target repo via the CLI.

## Non-goals in v1

- Dynamic flow configuration via YAML. Planned for v2.
- Backlog integration. Planned for v2.
- Cloud runners or webhooks. Out of scope for v1.

## Assumptions and prerequisites

- Claude Code CLI is installed and authenticated on the developer machine.
- Node.js 18+ and Git are installed.
- GitHub CLI `gh` is available if you want the PR step.

## Deliverables

1. CLI package `@your-scope/claude-project` that exposes the command `claude-project`.
2. Templates copied into a target repo:
   - `.claude/settings.json` with PreToolUse validator and a simple PostToolUse hook
   - `.claude/commands/` with six atomic commands
   - `tools/` with orchestrator, validators, status, process runner, status CLI, TUI, minimal web view
   - `configs/` with ESLint, Prettier, tsconfig
   - `.husky/` pre-commit and pre-push
   - `claude-Tasks/` with a sample task
3. Scripts and dev dependencies merged into the target repo `package.json`.

## High level repository layout for the CLI package

```
claude-project/
├─ package.json
├─ tsconfig.json
├─ src/
│  ├─ index.ts
│  ├─ init.ts
│  ├─ utils/
│  │  ├─ fs.ts
│  │  └─ pkg.ts
│  └─ files/
│     ├─ dot-claude/
│     │  ├─ settings.json
│     │  └─ commands/*.md
│     ├─ tools/
│     │  ├─ orchestrator.ts
│     │  ├─ validators.ts
│     │  ├─ status.ts
│     │  ├─ proc.ts
│     │  ├─ status-cli.ts
│     │  ├─ tui.ts
│     │  └─ web.ts
│     ├─ tasks/sample.md
│     ├─ configs/.eslintrc.cjs
│     ├─ configs/.prettierrc.json
│     ├─ configs/tsconfig.json
│     ├─ husky/pre-commit
│     └─ husky/pre-push
```

## Phase plan and acceptance criteria

### Phase 1. Bootstrap CLI repository

**Tasks**

- Create `package.json` with `bin` entry, build scripts, and dependencies: `commander`, `fs-extra`, `picocolors`, `tsx`, `typescript`.
- Create `tsconfig.json` for ESM build.
- Implement `src/index.ts` using Commander with command `init`.
- Implement `src/init.ts` that copies templates and merges `package.json` scripts and dev deps.
- Implement `src/utils/pkg.ts` with a safe JSON merge.

**Acceptance criteria**

- `npm run build` outputs `dist/` and `npx ./dist/index.js init --help` prints usage.

**Reference snippets** `package.json` for CLI package

```json
{
  "name": "@your-scope/claude-project",
  "version": "0.1.0",
  "type": "module",
  "bin": { "claude-project": "./dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "fs-extra": "^11.2.0",
    "picocolors": "^1.0.0"
  },
  "devDependencies": {
    "tsx": "^4.15.7",
    "typescript": "^5.5.4"
  }
}
```

`tsconfig.json` for CLI package

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "strict": true
  },
  "include": ["src"]
}
```

`src/index.ts`

```ts
import { Command } from "commander";
import { init } from "./init.js";
import pc from "picocolors";

const program = new Command();
program.name("claude-project").description("Scaffold Claude headless workflow into a TS repo").version("0.1.0");

program
  .command("init")
  .description("Install templates, tools, hooks, and scripts into the current repo")
  .option("--task-folder <path>", "folder for task markdown files", "claude-Tasks")
  .action(async (opts) => {
    await init(process.cwd(), { taskFolder: opts.taskFolder });
    console.log(pc.green("Done. Next: npm install"));
  });

program.parseAsync();
```

`src/init.ts`

```ts
import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import { mergePackageJson } from "./utils/pkg.js";

export async function init(targetRoot: string, opts: { taskFolder: string }) {
  const tpl = path.resolve(new URL("./files", import.meta.url).pathname);

  await fs.copy(path.join(tpl, "dot-claude"), path.join(targetRoot, ".claude"), { overwrite: false });
  await fs.copy(path.join(tpl, "tools"), path.join(targetRoot, "tools"), { overwrite: false });
  await fs.copy(path.join(tpl, "configs"), targetRoot, { overwrite: false });

  await fs.ensureDir(path.join(targetRoot, ".husky"));
  await fs.copy(path.join(tpl, "husky", "pre-commit"), path.join(targetRoot, ".husky", "pre-commit"), { overwrite: false });
  await fs.copy(path.join(tpl, "husky", "pre-push"), path.join(targetRoot, ".husky", "pre-push"), { overwrite: false });
  await fs.chmod(path.join(targetRoot, ".husky", "pre-commit"), 0o755);
  await fs.chmod(path.join(targetRoot, ".husky", "pre-push"), 0o755);

  await fs.ensureDir(path.join(targetRoot, opts.taskFolder));
  await fs.copy(path.join(tpl, "tasks", "sample.md"), path.join(targetRoot, opts.taskFolder, "task-001-sample.md"), { overwrite: false });

  const pkgPath = path.join(targetRoot, "package.json");
  const pkg = await fs.readJson(pkgPath);
  const delta = {
    scripts: {
      "prepare": "husky install",
      "claude:run": "tsx tools/orchestrator.ts",
      "claude:watch": "tsx tools/watch-tasks.ts",
      "claude:status": "tsx tools/status-cli.ts",
      "claude:tui": "tsx tools/tui.ts",
      "claude:web": "tsx tools/web.ts",
      "lint": "eslint .",
      "lint:fix": "eslint . --fix",
      "test": "vitest",
      "test:ci": "vitest run --coverage"
    },
    devDependencies: {
      "tsx": "^4.15.7",
      "typescript": "^5.5.4",
      "vitest": "^1.6.0",
      "@types/node": "^20.12.7",
      "eslint": "^9.6.0",
      "@typescript-eslint/eslint-plugin": "^7.7.1",
      "@typescript-eslint/parser": "^7.7.1",
      "prettier": "^3.3.3",
      "eslint-config-prettier": "^9.1.0",
      "lint-staged": "^15.2.7",
      "chokidar": "^3.6.0",
      "blessed": "^0.1.81",
      "glob": "^10.4.5",
      "express": "^4.19.2"
    }
  } as const;
  await fs.writeJson(pkgPath, mergePackageJson(pkg, delta), { spaces: 2 });

  console.log(pc.cyan("Scaffolded .claude, tools, husky, configs, scripts"));
}
```

`src/utils/pkg.ts`

```ts
export function mergePackageJson(base: any, delta: any) {
  const out = { ...base } as any;
  out.scripts = { ...(base.scripts || {}), ...(delta.scripts || {}) };
  out.devDependencies = { ...(base.devDependencies || {}), ...(delta.devDependencies || {}) };
  return out;
}
```

### Phase 2. Provide templates that the CLI copies into target repos

**Tasks**

- `.claude/settings.json` with PreToolUse and PostToolUse hooks
- `.claude/commands/` six single-purpose commands
- `tools/` orchestrator and helpers
- `configs/` ESLint, Prettier, tsconfig for the target
- `.husky/` hooks
- `claude-Tasks/task-001-sample.md`

**Acceptance criteria**

- After `claude-project init` and `npm install` in a clean TS repo, running `npm run claude:run <task.md>` successfully executes the first step and writes status and logs.

**Key templates** `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Read","Write","Edit","MultiEdit","Grep","Glob","LS",
      "Bash(git *:*)","Bash(npm *:*)","Bash(vitest:*:*)","Bash(node:*)"
    ],
    "deny": ["WebFetch","WebSearch"]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "tsx ./tools/validators.ts preWrite < /dev/stdin" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node -e \"process.stdin.on('data',()=>{});\" >/dev/null 2>&1 || true" }
        ]
      }
    ]
  }
}
```

`.claude/commands/plan-task.md`

```md
---
description: Generate a precise implementation plan. No code edits.
allowed-tools: Read, Glob, Grep
argument-hint: path-to-task-md
---
Read the task at @$ARGUMENTS. Create a clear, step-by-step plan covering scope, interfaces, data shapes, risks, edge cases, and a test plan.
Do not write or edit any code.
Write the plan to PLAN.md at the repo root. Overwrite if present.
```

`.claude/commands/write-tests.md`

```md
---
description: Write failing tests from PLAN.md. Do not change src code yet.
allowed-tools: Read, Write, Edit, Bash(vitest *:*), Bash(npm *:*)
argument-hint: path-to-task-md
---
Use PLAN.md and @$ARGUMENTS to create tests under /test.
Run tests and confirm they fail for the right reasons.
Do not modify src code.
```

`.claude/commands/implement.md`

```md
---
description: Implement code so all tests pass. Do not weaken tests.
allowed-tools: Read, Write, Edit, MultiEdit, Bash(vitest *:*), Bash(npm *:*)
---
Implement the minimal code to pass all tests. Iterate by running tests, diagnosing root causes, and fixing underlying issues.
Do not relax or remove assertions in tests.
```

`.claude/commands/docs-update.md`

```md
---
description: Update docs for the change.
allowed-tools: Read, Write, Edit
---
Update README.md and any docs to reflect the new behavior, usage, and limitations.
```

`.claude/commands/self-review.md`

```md
---
description: Improve names, style, and docstrings without changing behavior.
allowed-tools: Read, Edit, Glob, Grep
---
Perform a stylistic review. Improve identifiers, add JSDoc, and remove obvious smells.
Keep diffs minimal and behavior unchanged.
```

`.claude/commands/push-pr.md`

```md
---
description: Push branch and open a draft PR via gh.
allowed-tools: Bash(git *:*), Bash(gh pr create:*), Read
---
!`git status`
!`git branch --show-current`
Push the branch and open a draft PR with a clear title and description. Include test notes.
```

### Phase 3. Implement orchestrator and helpers in the template

**Tasks**

- `tools/proc.ts` for streaming subprocess output to terminal and logs
- `tools/status.ts` for atomic status and events logging
- `tools/orchestrator.ts` for step machine and validations
- `tools/validators.ts` for PreToolUse blocking based on state
- `tools/status-cli.ts` and `tools/tui.ts` for quick visibility
- `tools/web.ts` minimal Express reader of `state/*.json`

**Acceptance criteria**

- Running `npm run claude:run <task.md>` executes step 1 and writes `state/<taskId>.state.json` and `logs/<taskId>/`.
- Failing validations stop the pipeline and print actionable errors.

`tools/proc.ts`

```ts
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";

export function runStreaming(cmd: string, args: string[], logPath: string): Promise<number> {
  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "a" });
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: false });
    const forward = (chunk: any) => { process.stdout.write(chunk); logStream.write(chunk); };
    p.stdout.on("data", forward);
    p.stderr.on("data", forward);
    p.on("close", (code) => { logStream.end(); resolve(code ?? 1); });
  });
}
```

`tools/status.ts`

```ts
import fs from "node:fs";
import path from "node:path";

export type Phase = "pending" | "running" | "done" | "failed" | "interrupted";
export type TaskStatus = {
  version: number;
  taskId: string;
  branch: string;
  currentStep: string;
  phase: Phase;
  steps: Record<string, Phase>;
  lastUpdate: string;
  prUrl?: string;
  lastCommit?: string;
};

function writeJsonAtomic(file: string, data: unknown) {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.tmp`);
  const json = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmp, "w");
  try { fs.writeFileSync(fd, json, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

export function updateStatus(file: string, mut: (s: TaskStatus) => void) {
  let s: TaskStatus = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : { version: 1, taskId: "unknown", branch: "", currentStep: "", phase: "pending", steps: {}, lastUpdate: new Date().toISOString() };
  mut(s);
  s.lastUpdate = new Date().toISOString();
  writeJsonAtomic(file, s);
}
```

`tools/validators.ts` PreToolUse example

```ts
import fs from "node:fs";

function readState() {
  const files = fs.readdirSync("state").filter(f => f.endsWith(".state.json"));
  if (!files.length) return null;
  const p = `state/${files[0]}`;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const input = await new Promise<string>((res) => { let buf = ""; process.stdin.on("data", d => buf += d); process.stdin.on("end", () => res(buf)); });
const payload = JSON.parse(input || "{}");
const pathEdited: string | undefined = payload?.tool_input?.file_path;
const state = readState();

function block(msg: string) { process.stderr.write(msg + "\n"); process.exit(2); }

if (state && pathEdited) {
  const testsDone = state.steps?.write_tests === "done";
  const implDone = state.steps?.implement === "done";
  if (pathEdited.startsWith("src/") && !testsDone) block("Blocked: write tests before editing src/");
  if ((pathEdited.endsWith("README.md") || pathEdited.startsWith("docs/")) && !implDone) block("Blocked: update docs after implementation");
}
```

`tools/orchestrator.ts` outline

```ts
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { globSync } from "glob";
import { runStreaming } from "./proc";
import { updateStatus } from "./status";

async function step(name: string, args: string[], log: string, check: () => void | Promise<void>) {
  updateStatus("state/current.state.json", s => { s.currentStep = name; s.phase = "running"; s.steps[name] = "running"; });
  const code = await runStreaming("claude", ["-p", ...args], log);
  if (code !== 0) { updateStatus("state/current.state.json", s => { s.phase = "failed"; s.steps[name] = "failed"; }); throw new Error(`${name} failed`); }
  await check();
  execSync(`git add -A && git commit -m \"chore(${name}): checkpoint\"`, { stdio: "inherit" });
  updateStatus("state/current.state.json", s => { s.phase = "done"; s.steps[name] = "done"; });
}

function testsShouldFail() { try { execSync("npm run test:ci", { stdio: "pipe" }); throw new Error("Tests passed unexpectedly"); } catch { return; } }
function testsShouldPass() { execSync("npm run test:ci", { stdio: "inherit" }); }

export async function runTask(taskPath: string) {
  execSync("mkdir -p state logs", { stdio: "ignore" });
  await step("plan", ["/project:plan-task", taskPath], "logs/01-plan.log", () => { if (!existsSync("PLAN.md")) throw new Error("PLAN.md missing"); });
  await step("write_tests", ["/project:write-tests", taskPath], "logs/02-tests.log", () => {
    const tests = globSync("test/**/*.{test,spec}.ts");
    if (!tests.length) throw new Error("No tests found");
    testsShouldFail();
  });
  await step("implement", ["/project:implement"], "logs/03-implement.log", () => { testsShouldPass(); });
  await step("docs", ["/project:docs-update"], "logs/04-docs.log", () => {});
  await step("review", ["/project:self-review"], "logs/05-review.log", () => { execSync("npm run lint:fix || true", { stdio: "inherit" }); });
  await step("pr", ["/project:push-pr"], "logs/06-pr.log", () => {});
}

if (require.main === module) {
  const task = process.argv[2];
  if (!task) throw new Error("Usage: tsx tools/orchestrator.ts <task.md>");
  runTask(task).catch(e => { console.error(e); process.exit(1); });
}
```

`tools/status-cli.ts`

```ts
import fs from "node:fs";
const s = fs.existsSync("state/current.state.json") ? JSON.parse(fs.readFileSync("state/current.state.json", "utf8")) : null;
console.log(JSON.stringify(s, null, 2));
```

`tools/tui.ts` minimal

```ts
import blessed from "blessed";
import fs from "node:fs";

const screen = blessed.screen({ smartCSR: true });
const box = blessed.box({ top: 0, left: 0, width: "100%", height: "100%", border: "line", label: " Claude task status " });
screen.append(box);
function render() {
  const s = fs.existsSync("state/current.state.json") ? JSON.parse(fs.readFileSync("state/current.state.json", "utf8")) : null;
  if (!s) { box.setContent("No status yet"); screen.render(); return; }
  const steps = Object.entries(s.steps || {}).map(([k,v]) => `- ${k}: ${v}`).join("\n");
  box.setContent([`Current: ${s.currentStep} (${s.phase})`, steps, `Updated: ${s.lastUpdate}`].join("\n"));
  screen.render();
}
setInterval(render, 1000);
screen.key(["q","C-c"], () => process.exit(0));
render();
```

`tools/web.ts` minimal web view

```ts
import express from "express";
import fs from "node:fs";

const app = express();
app.get("/", (_req, res) => {
  const files = fs.readdirSync("state").filter(f => f.endsWith(".state.json"));
  const rows = files.map(f => {
    const s = JSON.parse(fs.readFileSync(`state/${f}`, "utf8"));
    return `<tr><td>${s.taskId}</td><td>${s.currentStep}</td><td>${s.phase}</td><td>${s.lastUpdate}</td></tr>`;
  }).join("");
  res.send(`<!doctype html><html><body><h1>Claude tasks</h1><table border="1"><tr><th>Task</th><th>Step</th><th>Phase</th><th>Updated</th></tr>${rows}</table></body></html>`);
});
app.listen(5177, () => console.log("Status web on http://localhost:5177"));
```

### Phase 4. Watcher and run commands in the target repo

**Tasks**

- `tools/watch-tasks.ts` using `chokidar` to run the orchestrator for new files in `claude-Tasks/`.
- Add scripts to `package.json` that call orchestrator, watcher, tui, web, tests, and lint.

**Acceptance criteria**

- Creating a new `claude-Tasks/*.md` triggers a run and produces logs and status.

`tools/watch-tasks.ts`

```ts
import chokidar from "chokidar";
import { spawn } from "node:child_process";

function run(taskPath: string) {
  const p = spawn("tsx", ["tools/orchestrator.ts", taskPath], { stdio: "inherit" });
  p.on("close", (code) => console.log(`[${taskPath}] finished with ${code}`));
}

chokidar.watch("claude-Tasks/*.md", { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 500 } })
  .on("add", (path) => run(path));
```

### Phase 5. Husky hooks in the target repo

**Tasks**

- Pre-commit: run lint-staged and optionally guard that plan and tests exist on task branches.
- Pre-push: run `npm run test:ci`.

**Acceptance criteria**

- Commits and pushes are blocked if tests or lint fail.

`.husky/pre-commit`

```bash
#!/usr/bin/env bash
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

`.husky/pre-push`

```bash
#!/usr/bin/env bash
. "$(dirname "$0")/_/husky.sh"

npm run test:ci
```

### Phase 6. QA on a scratch TS repo

**Tasks**

- Run `npx claude-project init` in a fresh TS repo. Install deps.
- Run `npm run claude:run claude-Tasks/task-001-sample.md` and watch TUI and web.
- Confirm step checkpoints, commits, logs, status, and PR open.
- Fix defects and iterate.

**Acceptance criteria**

- All phases complete without manual edits apart from approvals.

### Phase 7. Documentation and publish locally

**Tasks**

- Write README with install, usage, troubleshooting, and limitations.
- Publish to npm link for local testing by user. 

**Acceptance criteria**

- `npx claude-project init` works on a clean repo and produces a functional workflow (will be tested by user)

## Definition of done

- CLI compiles and runs.
- Templates copy correctly and do not overwrite existing files without backup or prompt.
- Orchestrator executes the six steps in order, commits at checkpoints, and writes status.
- PreToolUse validator blocks out-of-order edits reliably.
- Git hooks enforce tests and lint on push.
- Minimal TUI and web view show live step and phase.
- Sample task completes end to end and opens a draft PR.

## Risks and mitigations

- LLM may attempt to edit out of order. Mitigate with PreToolUse validator that reads state and blocks writes.
- Test runner or path assumptions may differ across repos. Mitigate with clear defaults and early doctor checks.
- Large repos could slow globbing. Mitigate with narrow globs in validators.
- Developer machine crashes mid step. Mitigate with atomic state writes and idempotent steps.

## Next steps for v2

- `claude-flow.yml` configurable pipeline with step order and prompts.
- Backlog integration as alternative task source.
- Optional remote runner and webhook mode.
- Richer web UI with streaming logs and diff previews.
- Concurrent Task Execution: Refactor the orchestrator and state management tools (`status.ts`, `validators.ts`) to robustly support running multiple tasks concurrently within the same repository, moving from a single `current.state.json` to a task-ID-based system.
- Interactive Initialization: Enhance the `claude-project init` command to detect existing script or dependency conflicts in `package.json` and interactively prompt the user for resolution (e.g., overwrite, skip), making it safer to adopt in established repositories.
- Centralized Project Configuration: Introduce a `claude.config.ts` file to centralize hard-coded paths (e.g., for state, logs, tasks) and command names, providing an intermediate step towards the fully dynamic `claude-flow.yml`.
- Add license and version information, then publish to npm publicly

