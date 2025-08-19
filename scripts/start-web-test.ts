// scripts/start-web-test.ts
import path from 'node:path';
import pc from 'picocolors';
// Note: We will modify startWebServer in the next step to make this work.
import { startWebServer } from '../src/tools/web.js';

async function run() {
  console.log(pc.cyan("--- Starting Web Dashboard in Test Mode ---"));

  const projectRoot = process.cwd();
  const mockStateDir = path.join(projectRoot, 'test', 'e2e-data', 'state');
  const mockLogsDir = path.join(projectRoot, 'test', 'e2e-data', 'logs');

  console.log(pc.yellow(`› Using mock state from: ${mockStateDir}`));
  console.log(pc.yellow(`› Using mock logs from:  ${mockLogsDir}`));

  // We will update startWebServer to accept this options object
  await startWebServer({
    stateDir: mockStateDir,
    logsDir: mockLogsDir,
  });
}

run();