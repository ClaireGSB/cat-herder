import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";

// Define the structure of a check object from the config
export type CheckConfig = {
  type: "none" | "fileExists" | "shell";
  path?: string;
  command?: string;
  expect?: "pass" | "fail";
};

/**
 * Executes a validation check based on a configuration object.
 */
export async function runCheck(checkConfig: CheckConfig, projectRoot: string) {
  console.log(`\n[Orchestrator] Running check: ${pc.yellow(checkConfig.type)}`);

  switch (checkConfig.type) {
    case "none":
      console.log(pc.gray("  › No automated validation for this step."));
      return;

    case "fileExists":
      if (!checkConfig.path) throw new Error("Check type 'fileExists' requires a 'path' property.");
      const filePath = path.join(projectRoot, checkConfig.path);
      if (!existsSync(filePath)) throw new Error(`Validation failed: File not found at ${filePath}`);
      console.log(pc.green(`  ✔ Check passed: File "${checkConfig.path}" exists.`));
      return;

    case "shell":
      if (!checkConfig.command) throw new Error("Check type 'shell' requires a 'command' property.");
      const expect = checkConfig.expect || "pass";
      console.log(`  › Executing: "${checkConfig.command}" (expecting to ${expect})`);

      try {
        execSync(checkConfig.command, { stdio: "pipe", cwd: projectRoot });
        if (expect === "fail") throw new Error(`Validation failed: Command "${checkConfig.command}" succeeded but was expected to fail.`);
        console.log(pc.green(`  ✔ Check passed: Command succeeded as expected.`));
      } catch (error) {
        if (expect === "pass") {
          console.error(pc.red(`  ✖ Check failed: Command "${checkConfig.command}" failed but was expected to pass.`));
          if (error instanceof Error && 'stderr' in error) console.error(pc.gray((error as any).stderr.toString()));
          throw error;
        }
        console.log(pc.green(`  ✔ Check passed: Command failed as expected.`));
      }
      return;

    default:
      throw new Error(`Unknown check type: ${(checkConfig as any).type}`);
  }
}