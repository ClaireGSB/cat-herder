#!/usr/bin/env node
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
