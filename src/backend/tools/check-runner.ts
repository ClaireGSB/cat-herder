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

// Define the result of a check operation
export interface CheckResult {
  success: boolean;
  output?: string;
}

/**
 * Executes a single validation check based on a configuration object.
 */
async function runSingleCheck(checkConfig: CheckConfig, projectRoot: string): Promise<CheckResult> {
  console.log(`\n[Orchestrator] Running check: ${pc.yellow(checkConfig.type)}`);

  switch (checkConfig.type) {
    case "none":
      console.log(pc.gray("  › No automated validation for this step."));
      return { success: true };

    case "fileExists":
      if (!checkConfig.path) throw new Error("Check type 'fileExists' requires a 'path' property.");
      const filePath = path.join(projectRoot, checkConfig.path);
      if (!existsSync(filePath)) {
        const errorMsg = `Validation failed: File not found at ${filePath}`;
        console.error(pc.red(`  ✖ Check failed: ${errorMsg}`));
        return { success: false, output: errorMsg };
      }
      console.log(pc.green(`  ✔ Check passed: File "${checkConfig.path}" exists.`));
      return { success: true };

    case "shell":
      if (!checkConfig.command) throw new Error("Check type 'shell' requires a 'command' property.");
      const expect = checkConfig.expect || "pass";
      console.log(`  › Executing: "${checkConfig.command}" (expecting to ${expect})`);

      try {
        execSync(checkConfig.command, { stdio: "pipe", cwd: projectRoot });
        if (expect === "fail") {
          const errorMsg = `Validation failed: Command "${checkConfig.command}" succeeded but was expected to fail.`;
          console.error(pc.red(`  ✖ Check failed: ${errorMsg}`));
          return { success: false, output: errorMsg };
        }
        console.log(pc.green(`  ✔ Check passed: Command succeeded as expected.`));
        return { success: true };
      } catch (error) {
        if (expect === "pass") {
          const errorMsg = `Check failed: Command "${checkConfig.command}" failed but was expected to pass.`;
          console.error(pc.red(`  ✖ ${errorMsg}`));
          const stderr = error instanceof Error && 'stderr' in error ? (error as any).stderr?.toString() : '';
          const stdout = error instanceof Error && 'stdout' in error ? (error as any).stdout?.toString() : '';
          const output = stderr || stdout || (error instanceof Error ? error.message : String(error));
          if (stderr) console.error(pc.gray(stderr));
          return { success: false, output };
        }
        console.log(pc.green(`  ✔ Check passed: Command failed as expected.`));
        return { success: true };
      }

    default:
      throw new Error(`Unknown check type: ${(checkConfig as any).type}`);
  }
}

/**
 * Executes validation check(s) based on a configuration object or array of objects.
 * If an array is provided, checks are executed sequentially and the process fails
 * immediately if any single check fails.
 */
export async function runCheck(checkConfig: CheckConfig | CheckConfig[], projectRoot: string): Promise<CheckResult> {
  if (Array.isArray(checkConfig)) {
    for (const [index, singleCheck] of checkConfig.entries()) {
      console.log(`[Orchestrator] Running check ${index + 1}/${checkConfig.length}...`);
      const result = await runSingleCheck(singleCheck, projectRoot);
      if (!result.success) {
        // Immediately fail and return the result from the failing check
        return result;
      }
    }
    // All checks in the array passed
    return { success: true };
  } else {
    // It's a single check object, run as before
    return runSingleCheck(checkConfig, projectRoot);
  }
}