import fs from "fs-extra";
import path from "path";
import pc from "picocolors";
import { mergePackageJson } from "./utils/pkg.js";

export async function init(targetRoot: string, opts: { taskFolder: string }) {
  const tpl = path.resolve(new URL("./files", import.meta.url).pathname);

  await fs.copy(path.join(tpl, "dot-claude"), path.join(targetRoot, ".claude"), { overwrite: false });
  await fs.copy(path.join(tpl, "tools"), path.join(targetRoot, "tools"), { overwrite: false });
  await fs.copy(path.join(tpl, "configs"), targetRoot, { overwrite: false });
  await fs.copy(path.join(tpl, "configs", ".lintstagedrc.json"), path.join(targetRoot, ".lintstagedrc.json"), { overwrite: false });
  

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
      "eslint": "^8.57.0",
      "@typescript-eslint/eslint-plugin": "^7.7.1",
      "@typescript-eslint/parser": "^7.7.1",
      "prettier": "^3.3.3",
      "eslint-config-prettier": "^9.1.0",
      "lint-staged": "^15.2.7",
      "chokidar": "^3.6.0",
      "blessed": "^0.1.81",
      "glob": "^10.4.5",
      "express": "^4.19.2",
      "husky": "^9.0.11"
    }
  } as const;
  await fs.writeJson(pkgPath, mergePackageJson(pkg, delta), { spaces: 2 });

  console.log(pc.cyan("Scaffolded .claude, tools, husky, configs, scripts"));
}