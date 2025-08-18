#!/usr/bin/env node
import { Command } from "commander";

import {
  initAction,
  runAction,
  runSequenceAction,
  validateAction,
  webAction,
  tuiAction,
  statusAction,
  watchAction
} from "./cli-actions.js";

const program = new Command();
program
  .name("claude-project")
  .description("A CLI tool for orchestrating Claude-based development workflows.")
  .version("0.1.0");

// `init` command
program
  .command("init")
  .description("Initializes claude-project in the current repository.")
  .action(initAction);

// `run` command
program
  .command("run <taskPath>")
  .description("Runs the automated workflow for a specific task file.")
  .option("-p, --pipeline <name>", "Specify the pipeline to run, overriding config and task defaults.")
  .action(runAction);

// `run-sequence` command
program
  .command("run-sequence <taskFolderPath>")
  .description("Runs a dynamic sequence of tasks from a specified folder.")
  .action(runSequenceAction);

// `validate` command
program
  .command("validate")
  .description("Validates the claude.config.js pipeline and offers to fix permissions.")
  .action(validateAction);

// `web` command
program
  .command("web")
  .description("Starts a web server to view task status.")
  .action(webAction);

// `tui` command
program
  .command("tui")
  .description("Starts a terminal UI to monitor task status.")
  .action(tuiAction);

// `status` command
program
  .command("status")
  .description("Displays the status of the most recent task.")
  .action(statusAction);

// `watch` command
program
  .command("watch")
  .description("Watches the tasks directory and runs new tasks automatically.")
  .action(watchAction);

// Parse commands from the process arguments
program.parseAsync(process.argv);
