import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'os';

// Mock only the external dependencies that we need to control
vi.mock('node:child_process');
vi.mock('../src/tools/proc.js');
vi.mock('../src/tools/check-runner.js');

// Import the functions after mocking
const { runStreaming } = await import('../src/tools/proc.js');
const { runCheck } = await import('../src/tools/check-runner.js');
const { runTaskSequence } = await import('../src/tools/orchestration/sequence-runner.js');

describe('Sequence Orchestrator Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;
  let taskFolderPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sequence-test-'));
    originalCwd = process.cwd();
    
    // Create task folder
    taskFolderPath = path.join(tempDir, 'test-sequence');
    await fs.ensureDir(taskFolderPath);
    
    // Mock successful Claude execution and checks
    vi.mocked(runStreaming).mockResolvedValue({ code: 0, output: '' });
    vi.mocked(runCheck).mockResolvedValue({ success: true, output: 'success' });
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));
    
    // Setup basic project structure in temp directory
    process.chdir(tempDir);
    
    // Create claude.config.js
    const configContent = `module.exports = {
  taskFolder: "test-sequence",
  statePath: ".test-cat-herder/state",
  logsPath: ".test-cat-herder/logs",
  defaultPipeline: "default",
  manageGitBranch: true,
  autoCommit: true,
  waitForRateLimitReset: false,
  pipelines: {
    default: [
      {
        name: "implement",
        command: "implement",
        check: { type: "none" }
      }
    ]
  }
};`;
    await fs.writeFile(path.join(tempDir, 'claude.config.js'), configContent);
    
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'test-project',
      version: '1.0.0',
      scripts: { test: 'echo "test"' }
    });
    
    await fs.ensureDir(path.join(tempDir, '.claude', 'commands'));
    await fs.ensureDir(path.join(tempDir, '.claude', 'state'));
    await fs.ensureDir(path.join(tempDir, '.claude', 'logs'));
    
    // Create a proper command file
    const commandContent = `---
description: Implement the task
allowed-tools: Read, Write, Edit
---

Implement the task as described in the markdown file.
`;
    await fs.writeFile(path.join(tempDir, '.claude', 'commands', 'implement.md'), commandContent);
  });

  afterEach(async () => {
    // Clean up
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it('should execute a dynamic sequence of tasks in alphabetical order', async () => {
    // Create initial task that will generate more tasks
    const initialTask = `---
title: Create Additional Tasks
---

# Create Additional Tasks

This task should create two additional task files.
`;

    await fs.writeFile(path.join(taskFolderPath, '01-create-tasks.md'), initialTask);
    
    // Mock runStreaming to simulate task execution with file creation
    let callCount = 0;
    vi.mocked(runStreaming).mockImplementation(async (cmd, args, logFile, reasoningLogFile, cwd, prompt) => {
      callCount++;
      
      if (callCount === 1) {
        // First task execution - create the additional task files
        const task02 = `---
title: Second Step
---

# Second Step

This is the second step in the sequence.
`;
        
        const task03 = `---
title: Final Step  
---

# Final Step

This is the final step in the sequence.
`;
        
        await fs.writeFile(path.join(taskFolderPath, '02-next-step.md'), task02);
        await fs.writeFile(path.join(taskFolderPath, '03-final-step.md'), task03);
      }
      
      return { code: 0, output: '' };
    });

    // Execute the sequence
    await runTaskSequence(taskFolderPath);

    // Verify all three tasks were executed in order
    expect(runStreaming).toHaveBeenCalledTimes(3);
    
    // Verify the files were created and are accessible
    expect(await fs.pathExists(path.join(taskFolderPath, '01-create-tasks.md'))).toBe(true);
    expect(await fs.pathExists(path.join(taskFolderPath, '02-next-step.md'))).toBe(true);
    expect(await fs.pathExists(path.join(taskFolderPath, '03-final-step.md'))).toBe(true);
    
    // Verify git operations were called for each task
    const gitCommitCalls = vi.mocked(execSync).mock.calls.filter(call => 
      call[0].toString().includes('git commit')
    );
    expect(gitCommitCalls.length).toBeGreaterThan(0);
  });

  it('should fail immediately when task folder is empty', async () => {
    // Don't create any task files - folder should be empty
    
    await expect(runTaskSequence(taskFolderPath)).rejects.toThrow(
      'Error: No task files (.md) found in folder'
    );
    
    // Verify no Claude execution happened
    expect(runStreaming).not.toHaveBeenCalled();
  });

  it('should fail immediately when task folder does not exist', async () => {
    const nonExistentPath = path.join(tempDir, 'non-existent-folder');
    
    await expect(runTaskSequence(nonExistentPath)).rejects.toThrow(
      'Error: Folder does not exist or cannot be accessed'
    );
    
    // Verify no Claude execution happened
    expect(runStreaming).not.toHaveBeenCalled();
  });

  it.skip('should halt sequence and mark as failed when a task fails', async () => {
    // Create two tasks
    await fs.writeFile(path.join(taskFolderPath, '01-first-task.md'), `---
title: First Task
---

# First Task

This task should succeed.
`);

    await fs.writeFile(path.join(taskFolderPath, '02-failing-task.md'), `---
title: Failing Task
---

# Failing Task

This task should fail.
`);

    // Mock runStreaming to fail on second task
    let callCount = 0;
    vi.mocked(runStreaming).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Task execution failed');
      }
      return { code: 0, output: '' };
    });

    // Execute the sequence and expect it to fail
    await expect(runTaskSequence(taskFolderPath)).rejects.toThrow('Task execution failed');

    // Verify first task was executed, then second task failed
    expect(runStreaming).toHaveBeenCalledTimes(2); // Called twice, second call failed
  });

  it.skip('should execute a single task when only one exists', async () => {
    // Create a simple task
    await fs.writeFile(path.join(taskFolderPath, '01-simple-task.md'), `---
title: Simple Task
---

# Simple Task

This is a simple task.
`);

    // Execute the sequence
    await runTaskSequence(taskFolderPath);

    // Verify the task was executed
    expect(runStreaming).toHaveBeenCalledTimes(1);
    
    // Verify git operations occurred
    const gitCommitCalls = vi.mocked(execSync).mock.calls.filter(call => 
      call[0].toString().includes('git commit')
    );
    expect(gitCommitCalls.length).toBeGreaterThan(0);
  });
});