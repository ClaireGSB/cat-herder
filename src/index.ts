#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";

import { init } from "./init.js";
import { runTask } from "./tools/orchestrator.js";
import { startWebServer } from "./tools/web.js";
import { startTui } from "./tools/tui.js";
import { showStatus } from "./tools/status-cli.js";
import { startWatcher } from "./tools/watch-tasks.js";

const program = new Command();
program
  .name("claude-project")
  .description("A CLI tool for orchestrating Claude-based development workflows.")
  .version("0.1.0");

// `init` command
program
  .command("init")
  .description("Initializes claude-project in the current repository.")
  .action(async () => {
    try {
      await init(process.cwd());
    } catch (error: any) {
      console.error(pc.red(`Initialization failed: ${error.message}`));
      process.exit(1);
    }
  });

// `run` command
program
  .command("run <taskPath>")
  .description("Runs the automated workflow for a specific task file.")
  .action(async (taskPath) => {
    try {
      await runTask(taskPath);
    } catch (error: any) {
      console.error(pc.red(`\nWorkflow failed: ${error.message}`));
      process.exit(1);
    }
  });

// `web` command
program
  .command("web")
  .description("Starts a web server to view task status.")
  .action(startWebServer);

// `tui` command
program
  .command("tui")
  .description("Starts a terminal UI to monitor task status.")
  .action(startTui);

// `status` command
program
  .command("status")
  .description("Displays the status of the most recent task.")
  .action(showStatus);

// `watch` command
program
  .command("watch")
  .description("Watches the tasks directory and runs new tasks automatically.")
  .action(startWatcher);


// Parse commands from the process arguments
program.parseAsync(process.argv);
