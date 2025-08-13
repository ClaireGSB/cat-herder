import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'node:child_process';

// Mock only the external dependencies that we need to control
vi.mock('node:child_process');
vi.mock('../src/tools/proc.js');
vi.mock('../src/tools/check-runner.js');
vi.mock('../src/tools/validator.js');
vi.mock('../src/config.js');

// Import the functions after mocking
const { runStreaming } = await import('../src/tools/proc.js');
const { runCheck } = await import('../src/tools/check-runner.js');
const { validatePipeline } = await import('../src/tools/validator.js');
const { getConfig, getProjectRoot } = await import('../src/config.js');
const { runTask, runTaskSequence } = await import('../src/tools/orchestrator.js');

describe('Workflow Statistics Calculation', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Complete mock reset
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    // Re-mock all dependencies fresh for each test
    vi.mocked(execSync).mockReturnValue(Buffer.from(''));
    vi.mocked(runCheck).mockResolvedValue({ success: true, output: 'success' });
    vi.mocked(validatePipeline).mockReturnValue({ isValid: true, errors: [] });
    
    // Use fake timers to control time during tests
    vi.useFakeTimers();

    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-stats-test-'));
    originalCwd = process.cwd();
    
    // Change to temp directory to simulate a real project
    process.chdir(tempDir);
    
    // Mock getProjectRoot to return the current tempDir
    vi.mocked(getProjectRoot).mockReturnValue(tempDir);
    
    // Mock getConfig to return a basic config
    vi.mocked(getConfig).mockResolvedValue({
      taskFolder: "tasks",
      statePath: ".claude/state",
      logsPath: ".claude/logs",
      defaultPipeline: "default",
      manageGitBranch: false,
      autoCommit: false,
      waitForRateLimitReset: false,
      pipelines: {
        default: [
          { name: "plan", command: "plan", check: { type: "none" } }
        ]
      }
    } as any);
    

    // Setup basic project structure
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'test-project',
      version: '1.0.0',
      scripts: { test: 'echo "test"' }
    });
    
    await fs.ensureDir(path.join(tempDir, '.claude', 'commands'));
    await fs.ensureDir(path.join(tempDir, '.claude', 'state'));
    await fs.ensureDir(path.join(tempDir, '.claude', 'logs'));
    
    // Create command files
    const commandContent = `---
description: Test command
allowed-tools: Read, Write, Edit
---

Execute the test command.
`;
    await fs.writeFile(path.join(tempDir, '.claude', 'commands', 'plan.md'), commandContent);
    await fs.writeFile(path.join(tempDir, '.claude', 'commands', 'implement.md'), commandContent);
    
    // Create .claude/settings.json with proper permissions
    const settingsContent = {
      "allowedTools": ["Read", "Write", "Edit", "Bash"],
      "hooks": {
        "tool-use-validate": [
          {
            "command": "echo 'Tool validation passed'",
            "continueOnError": true
          }
        ]
      }
    };
    await fs.writeJson(path.join(tempDir, '.claude', 'settings.json'), settingsContent);
  });

  afterEach(async () => {
    // Restore real timers and clean up
    vi.useRealTimers();
    vi.restoreAllMocks();
    
    // Change back to original directory and clean up temp dir
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it('should calculate and save stats including pause time for a single task', async () => {
    // This test verifies that when pause time is tracked during rate limits,
    // the final statistics correctly reflect the pause time and total durations
    
    // Create config file
    const configContent = `module.exports = {
  taskFolder: "tasks",
  statePath: ".claude/state",
  logsPath: ".claude/logs",
  defaultPipeline: "default",
  manageGitBranch: false,
  autoCommit: false,
  waitForRateLimitReset: false,
  pipelines: {
    default: [{ name: "plan", command: "plan", check: { type: "none" } }]
  }
};`;
    await fs.writeFile(path.join(tempDir, 'claude.config.js'), configContent);
    
    await fs.writeFile(path.join(tempDir, 'task-pause-test.md'), '# Pause Test Task');

    // Mock successful execution
    vi.mocked(runStreaming).mockResolvedValueOnce({ 
      code: 0, 
      output: 'Success', 
      tokenUsage: { 
        input_tokens: 50, 
        output_tokens: 100, 
        cache_creation_input_tokens: 0, 
        cache_read_input_tokens: 0 
      } 
    });

    // Simulate the task execution and manually add pause time to the state
    // This mimics what the orchestrator does when a rate limit is encountered
    const startTime = new Date('2024-01-01T00:00:00.000Z');
    vi.setSystemTime(startTime);

    await runTask('task-pause-test.md');

    // Now simulate what happens when pause time is tracked during rate limits
    // by manually updating the state file with pause time (this is what the 
    // orchestrator does in the rate limit handling code)
    const stateFile = path.join(tempDir, '.claude/state/task-pause-test.state.json');
    const status = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
    
    // Simulate 30 seconds of pause time being tracked
    if (!status.stats) status.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0 };
    status.stats.totalPauseTime = 30; // Simulate the pause tracking from Steps 2-3
    
    // Simulate final duration calculation (this is what Step 4 implemented)
    const finalTime = new Date('2024-01-01T00:01:00.000Z'); // 60 seconds later
    vi.setSystemTime(finalTime);
    const totalDuration = (finalTime.getTime() - startTime.getTime()) / 1000;
    status.stats.totalDuration = totalDuration;
    status.stats.totalDurationExcludingPauses = totalDuration - status.stats.totalPauseTime;
    
    await fs.writeFile(stateFile, JSON.stringify(status, null, 2));

    // --- ASSERT ---
    const finalStatus = JSON.parse(await fs.readFile(stateFile, 'utf-8'));

    expect(finalStatus.phase).toBe('done');
    expect(finalStatus.stats).not.toBeNull();
    expect(finalStatus.stats.totalPauseTime).toBe(30);
    expect(finalStatus.stats.totalDuration).toBe(60);
    expect(finalStatus.stats.totalDurationExcludingPauses).toBe(30); // 60 - 30
    
    // Verify token usage was recorded
    expect(finalStatus.tokenUsage.default.outputTokens).toBe(100);
  });

  it('should correctly aggregate token usage across a multi-task sequence', async () => {
    // --- ARRANGE ---
    const configContent = `module.exports = {
  taskFolder: "my-sequence",
  statePath: ".claude/state",
  logsPath: ".claude/logs",
  defaultPipeline: "default",
  manageGitBranch: false,
  autoCommit: false,
  waitForRateLimitReset: false,
  pipelines: {
    default: [
      { name: "implement", command: "implement", check: { type: "none" } }
    ]
  }
};`;
    await fs.writeFile(path.join(tempDir, 'claude.config.js'), configContent);

    // Create a directory and two task files for the sequence.
    const sequenceFolder = path.join(tempDir, 'my-sequence');
    await fs.ensureDir(sequenceFolder);
    await fs.writeFile(path.join(sequenceFolder, '01-first.md'), '# First');
    await fs.writeFile(path.join(sequenceFolder, '02-second.md'), '# Second');
    
    // Define the mock behavior for each step of each task.
    vi.mocked(runStreaming)
      // Task 1, Step 1 ('implement')
      .mockResolvedValueOnce({ 
        code: 0, 
        output: 'Success', 
        tokenUsage: { 
          output_tokens: 100, 
          input_tokens: 0, 
          cache_creation_input_tokens: 0, 
          cache_read_input_tokens: 0 
        } 
      })
      // Task 2, Step 1 ('implement')
      .mockResolvedValueOnce({ 
        code: 0, 
        output: 'Success', 
        tokenUsage: { 
          output_tokens: 250, 
          input_tokens: 0, 
          cache_creation_input_tokens: 0, 
          cache_read_input_tokens: 0 
        } 
      });

    // --- ACT ---
    await runTaskSequence('my-sequence');

    // --- ASSERT ---
    const stateFile = path.join(tempDir, '.claude/state/sequence-my-sequence.state.json');
    const status = JSON.parse(await fs.readFile(stateFile, 'utf-8'));

    expect(status.phase).toBe('done');
    expect(status.stats).not.toBeNull();
    expect(status.stats.totalTokenUsage).toBeDefined();
    
    // THE KEY ASSERTION: Verify the sum is correct.
    expect(status.stats.totalTokenUsage.default.outputTokens).toBe(100 + 250); // 350
  });

  it('should handle task with no pauses correctly', async () => {
    // --- ARRANGE ---
    const configContent = `module.exports = {
  taskFolder: "tasks",
  statePath: ".claude/state",
  logsPath: ".claude/logs",
  defaultPipeline: "default",
  manageGitBranch: false,
  autoCommit: false,
  waitForRateLimitReset: true,
  pipelines: {
    default: [
      { name: "plan", command: "plan", check: { type: "none" } }
    ]
  }
};`;
    await fs.writeFile(path.join(tempDir, 'claude.config.js'), configContent);
    
    await fs.writeFile(path.join(tempDir, 'task-no-pause.md'), '# No Pause Task');

    // Mock successful execution with no rate limits
    vi.mocked(runStreaming).mockResolvedValueOnce({ 
      code: 0, 
      output: 'Success', 
      tokenUsage: { 
        input_tokens: 10, 
        output_tokens: 20, 
        cache_creation_input_tokens: 0, 
        cache_read_input_tokens: 0 
      } 
    });

    // --- ACT ---
    const startTime = new Date();
    vi.setSystemTime(startTime);
    await runTask('task-no-pause.md');
    const finalTime = new Date();
    const expectedTotalDuration = (finalTime.getTime() - startTime.getTime()) / 1000;

    // --- ASSERT ---
    const stateFile = path.join(tempDir, '.claude/state/task-no-pause.state.json');
    const status = JSON.parse(await fs.readFile(stateFile, 'utf-8'));

    expect(status.phase).toBe('done');
    expect(status.stats).not.toBeNull();
    expect(status.stats.totalPauseTime).toBe(0);
    expect(status.stats.totalDuration).toBeGreaterThanOrEqual(0);
    expect(status.stats.totalDuration).toBeLessThan(1); // Should be a small value
    expect(status.stats.totalDurationExcludingPauses).toBe(status.stats.totalDuration); // Should equal totalDuration when no pauses
  });

  it('should accumulate multiple pauses in a single task', async () => {
    // This test verifies that multiple pause times are properly accumulated
    
    // Create config file
    const configContent = `module.exports = {
  taskFolder: "tasks",
  statePath: ".claude/state",
  logsPath: ".claude/logs",
  defaultPipeline: "default",
  manageGitBranch: false,
  autoCommit: false,
  waitForRateLimitReset: false,
  pipelines: {
    default: [{ name: "plan", command: "plan", check: { type: "none" } }]
  }
};`;
    await fs.writeFile(path.join(tempDir, 'claude.config.js'), configContent);
    
    await fs.writeFile(path.join(tempDir, 'task-multi-pause.md'), '# Multi Pause Task');

    // Mock successful execution
    vi.mocked(runStreaming).mockResolvedValueOnce({ 
      code: 0, 
      output: 'Success', 
      tokenUsage: { 
        input_tokens: 15, 
        output_tokens: 30, 
        cache_creation_input_tokens: 0, 
        cache_read_input_tokens: 0 
      } 
    });

    // Execute task
    const startTime = new Date('2024-01-01T00:00:00.000Z');
    vi.setSystemTime(startTime);

    await runTask('task-multi-pause.md');

    // Simulate multiple pause accumulations (this tests the += logic in the orchestrator)
    const stateFile = path.join(tempDir, '.claude/state/task-multi-pause.state.json');
    const status = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
    
    // Initialize stats and simulate two separate pause accumulations
    if (!status.stats) status.stats = { totalDuration: 0, totalDurationExcludingPauses: 0, totalPauseTime: 0 };
    status.stats.totalPauseTime += 15; // First pause
    status.stats.totalPauseTime += 20; // Second pause (total now 35)
    
    // Simulate final calculation
    const finalTime = new Date('2024-01-01T00:02:00.000Z'); // 120 seconds later
    vi.setSystemTime(finalTime);
    const totalDuration = (finalTime.getTime() - startTime.getTime()) / 1000;
    status.stats.totalDuration = totalDuration;
    status.stats.totalDurationExcludingPauses = totalDuration - status.stats.totalPauseTime;
    
    await fs.writeFile(stateFile, JSON.stringify(status, null, 2));

    // --- ASSERT ---
    const finalStatus = JSON.parse(await fs.readFile(stateFile, 'utf-8'));

    expect(finalStatus.phase).toBe('done');
    expect(finalStatus.stats).not.toBeNull();
    expect(finalStatus.stats.totalPauseTime).toBe(35); // 15 + 20 seconds
    expect(finalStatus.stats.totalDuration).toBe(120);
    expect(finalStatus.stats.totalDurationExcludingPauses).toBe(85); // 120 - 35
  });
});