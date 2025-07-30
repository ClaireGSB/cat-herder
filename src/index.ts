#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import fs from "fs";
import path from "path";
import readline from "readline";

import { init } from "./init.js";
import { runTask } from "./tools/orchestrator.js";
import { startWebServer } from "./tools/web.js";
import { startTui } from "./tools/tui.js";
import { showStatus } from "./tools/status-cli.js";
import { startWatcher } from "./tools/watch-tasks.js";
import { validatePipeline } from "./tools/validator.js";
import { getConfig, getProjectRoot } from "./config.js";

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
  .option("-p, --pipeline <name>", "Specify the pipeline to run, overriding config and task defaults.")
  .action(async (taskPath, options) => {
    try {
      await runTask(taskPath, options.pipeline);
    } catch (error: any) {
      console.error(pc.red(`\nWorkflow failed: ${error.message}`));
      process.exit(1);
    }
  });

// `validate` command
program
  .command("validate")
  .description("Validates the claude.config.js pipeline and offers to fix permissions.")
  .action(async () => {
    try {
      const config = await getConfig();
      if (!config) {
        console.error(pc.red("✖ Could not load claude.config.js configuration."));
        process.exit(1);
      }
      
      const projectRoot = getProjectRoot();
      const { isValid, errors, missingPermissions } = validatePipeline(config, projectRoot);

      if (isValid) {
        console.log(pc.green("✔ Pipeline configuration is valid."));
        const stepCount = config.pipelines 
          ? Object.values(config.pipelines).reduce((total, pipeline) => total + pipeline.length, 0)
          : config.pipeline?.length || 0;
        console.log(pc.gray(`  › Found ${stepCount} steps.`));
        return;
      }

      console.error(pc.red("✖ Pipeline configuration is invalid:\n"));
      for (const error of errors) {
        console.error(pc.yellow(`  - ${error}`));
      }

      // --- Interactive Fixer Logic ---
      if (missingPermissions.length > 0) {
        console.log(pc.cyan("\nThis command can automatically add the missing permissions for you."));
        
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(pc.bold("Would you like to add these permissions to .claude/settings.json? (y/N) "), (answer) => {
          if (answer.toLowerCase() === 'y') {
            fixPermissions(projectRoot, missingPermissions);
          } else {
            console.log(pc.gray("Aborted. Please add permissions manually."));
          }
          rl.close();
        });
      } else {
        console.error(pc.gray("\nPlease fix the errors above and run 'claude-project validate' again."));
        process.exit(1);
      }

    } catch (error: any) {
      console.error(pc.red(`Validation error: ${error.message}`));
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


// Helper function to safely update settings.json
function fixPermissions(projectRoot: string, permissionsToAdd: string[]) {
    const settingsPath = path.join(projectRoot, ".claude", "settings.json");
    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        
        // Ensure the path to the 'allow' array exists
        if (!settings.permissions) settings.permissions = {};
        if (!settings.permissions.allow) settings.permissions.allow = [];

        // Use a Set to prevent duplicates
        const updatedPermissions = new Set([...settings.permissions.allow, ...permissionsToAdd]);
        settings.permissions.allow = [...updatedPermissions];

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log(pc.green("\n✔ Successfully updated .claude/settings.json."));
        console.log(pc.cyan("  Run 'claude-project validate' again to confirm."));

    } catch (e: any) {
        console.error(pc.red(`\nError updating settings.json: ${e.message}`));
        console.error(pc.gray("Please fix the file manually."));
    }
}

// Parse commands from the process arguments
program.parseAsync(process.argv);
