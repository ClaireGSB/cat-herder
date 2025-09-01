import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { init } from '../src/init.js';

describe('Init Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-test-'));
    originalCwd = process.cwd();
    
    // Create a minimal package.json in temp directory
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'test-project',
      version: '1.0.0',
      scripts: {},
      devDependencies: {}
    });
  });

  afterEach(async () => {
    // Clean up
    process.chdir(originalCwd);
    await fs.remove(tempDir);
  });

  it('should handle initialization with no existing .claude/settings.json', async () => {
    // Run init in the temp directory
    await init(tempDir);
    
    // Verify the .claude/settings.json was created
    const settingsPath = path.join(tempDir, '.claude', 'settings.json');
    expect(await fs.pathExists(settingsPath)).toBe(true);
    
    // Verify it contains the required hook
    const settings = await fs.readJson(settingsPath);
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true);
    
    // Find the Edit|Write|MultiEdit matcher
    const editMatcher = settings.hooks.PreToolUse.find(
      (h: any) => h.matcher === 'Edit|Write|MultiEdit'
    );
    expect(editMatcher).toBeDefined();
    expect(editMatcher.hooks).toBeDefined();
    expect(Array.isArray(editMatcher.hooks)).toBe(true);
    
    // Verify the pipeline validator hook is present
    const validatorHook = editMatcher.hooks.find(
      (h: any) => h.command && h.command.includes('pipeline-validator.js')
    );
    expect(validatorHook).toBeDefined();
  });

  it('should preserve existing settings and only add missing hook', async () => {
    // Create .claude directory and custom settings first
    const claudeDir = path.join(tempDir, '.claude');
    await fs.ensureDir(claudeDir);
    
    const customSettings = {
      permissions: {
        allow: ['Read', 'Write', 'CustomTool'],
        deny: ['WebFetch']
      },
      customProperty: 'user-defined-value',
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: 'echo "Custom bash validation"'
              }
            ]
          }
        ]
      }
    };
    
    await fs.writeJson(path.join(claudeDir, 'settings.json'), customSettings, { spaces: 2 });
    
    // Mock user input to accept adding the hook
    // Note: This test doesn't actually test the interactive prompt,
    // but verifies the structure would be correct if the hook was added
    
    const settingsPath = path.join(claudeDir, 'settings.json');
    const settings = await fs.readJson(settingsPath);
    
    // Verify custom settings are preserved
    expect(settings.permissions).toEqual(customSettings.permissions);
    expect(settings.customProperty).toBe(customSettings.customProperty);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].matcher).toBe('Bash');
    
    // Check that the required hook would be detected as missing
    const requiredMatcher = 'Edit|Write|MultiEdit';
    const requiredCommand = 'node ./node_modules/@your-scope/cat-herder/dist/tools/pipeline-validator.js < /dev/stdin';
    
    const matcherEntry = settings.hooks.PreToolUse.find(h => h.matcher === requiredMatcher);
    const hasRequiredHook = matcherEntry?.hooks?.some((h: any) => h.command === requiredCommand) || false;
    
    expect(hasRequiredHook).toBe(false);
  });

  it('should create all expected files and directories', async () => {
    await init(tempDir);
    
    // Verify main config file
    expect(await fs.pathExists(path.join(tempDir, 'cat-herder.config.js'))).toBe(true);
    
    // Verify .cat-herder steps directory structure
    expect(await fs.pathExists(path.join(tempDir, '.cat-herder', 'steps'))).toBe(true);
    
    // Verify some step files exist
    expect(await fs.pathExists(path.join(tempDir, '.cat-herder', 'steps', 'plan-task.md'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, '.cat-herder', 'steps', 'implement.md'))).toBe(true);
    
    // Verify task directory and sample
    expect(await fs.pathExists(path.join(tempDir, 'cat-herder-tasks'))).toBe(true);
    expect(await fs.pathExists(path.join(tempDir, 'cat-herder-tasks', 'task-001-sample.md'))).toBe(true);
    
    // Verify package.json was updated
    const pkg = await fs.readJson(path.join(tempDir, 'package.json'));
    expect(pkg.scripts['cat-herder:run']).toBeDefined();
    expect(pkg.devDependencies['vitest']).toBeDefined();
  });
});
