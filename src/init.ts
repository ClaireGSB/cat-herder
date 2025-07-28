import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import { mergePackageJson } from "./utils/pkg.js";

export async function init(targetRoot: string, opts: { taskFolder: string }) {
  const tpl = path.resolve(new URL("./files", import.meta.url).pathname);

  await fs.copy(path.join(tpl, "dot-claude"), path.join(targetRoot, ".claude"), { overwrite: false });
  await fs.copy(path.join(tpl, "tools"), path.join(targetRoot, "tools"), { overwrite: false });
  // copying config files individually to control their name (we need to rename tsconfig; had to name it tsconfig.template.json to avoid type errors)
  await fs.copy(path.join(tpl, "configs", ".eslintrc.cjs"), path.join(targetRoot, ".eslintrc.cjs"), { overwrite: false });
  await fs.copy(path.join(tpl, "configs", ".prettierrc.json"), path.join(targetRoot, ".prettierrc.json"), { overwrite: false });
  await fs.copy(path.join(tpl, "configs", "vitest.config.js"), path.join(targetRoot, "vitest.config.js"), { overwrite: false });
  await fs.copy(path.join(tpl, "configs", "tsconfig.template.json"), path.join(targetRoot, "tsconfig.json"), { overwrite: false });

  await fs.ensureDir(path.join(targetRoot, opts.taskFolder));
  await fs.copy(path.join(tpl, "tasks", "sample.md"), path.join(targetRoot, opts.taskFolder, "task-001-sample.md"), { overwrite: false });

  const pkgPath = path.join(targetRoot, "package.json");
  const pkg = await fs.readJson(pkgPath);

  // --- MODIFIED DELTA OBJECT ---
  const delta = {
    scripts: {
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
      // Core dependencies for the orchestrator itself
      "tsx": "^4.15.7",
      "typescript": "^5.5.4",
      "vitest": "^1.6.0",
      "@vitest/coverage-v8": "^1.6.0", 
      "@types/node": "^20.12.7",
      "chokidar": "^3.6.0",
      "blessed": "^0.1.81",
      "glob": "^10.4.5",
      "express": "^4.19.2",
      
      // Optional QA dependencies for user convenience
      "eslint": "^8.57.0",
      "@typescript-eslint/eslint-plugin": "^7.7.1",
      "@typescript-eslint/parser": "^7.7.1",
      "prettier": "^3.3.3",
      "eslint-config-prettier": "^9.1.0",
      // "lint-staged": "^15.2.7", <-- REMOVED
    }
  } as const;
  await fs.writeJson(pkgPath, mergePackageJson(pkg, delta), { spaces: 2 });

  console.log(pc.cyan("Scaffolded .claude, tools, configs, and scripts. Git hooks are NOT managed by this tool."));
}