import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, mkdirSync } from 'node:fs';
import fs from 'node:fs';

// Mock dependencies
vi.mock('node:fs');
vi.mock('node:path');
vi.mock('../src/tools/proc.js');
vi.mock('../src/tools/status.js');
vi.mock('../src/config.js');
vi.mock('../src/tools/check-runner.js');
vi.mock('../src/utils/id-generation.js');
vi.mock('../src/tools/orchestration/prompt-builder.js');
vi.mock('../src/tools/orchestration/step-runner.js');
vi.mock('../src/tools/providers.js');

// Import functions after mocking
const { runStreaming } = await import('../src/tools/proc.js');
const { updateStatus, readStatus } = await import('../src/tools/status.js');
const { getProjectRoot, getConfig, resolveDataPath } = await import('../src/config.js');
const { runCheck } = await import('../src/tools/check-runner.js');
const { taskPathToTaskId } = await import('../src/utils/id-generation.js');
const { parseTaskFrontmatter, assemblePrompt } = await import('../src/tools/orchestration/prompt-builder.js');
const { executeStep } = await import('../src/tools/orchestration/step-runner.js');
const { contextProviders } = await import('../src/tools/providers.js');
const { executePipelineForTask } = await import('../src/tools/orchestration/pipeline-runner.js');

import path from 'node:path';

describe('Orchestrator - Stepless Pipeline Execution', () => {
  const MOCK_TASK_CONTENT = '# A Simple Documentation Task\n\nPlease update the README.md file to include a section on the new stepless pipeline feature.';
  
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks for a successful run
    vi.mocked(getProjectRoot).mockReturnValue('/test/project');
    vi.mocked(resolveDataPath).mockReturnValue('/test/project/.cat-herder/state');
    vi.mocked(readStatus).mockReturnValue({ taskId: 'test-task', steps: {}, interactionHistory: [] } as any);
    vi.mocked(updateStatus).mockImplementation(() => {});
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(runCheck).mockResolvedValue({ success: true });
    vi.mocked(runStreaming).mockResolvedValue({ code: 0, output: 'Done.' });
    vi.mocked(taskPathToTaskId).mockReturnValue('test-task-id');
    vi.mocked(parseTaskFrontmatter).mockReturnValue({ 
      pipeline: 'docs-only', 
      autonomyLevel: 0, 
      body: MOCK_TASK_CONTENT 
    });
    vi.mocked(assemblePrompt).mockReturnValue('Assembled prompt content');
    
    // Mock executeStep to call runStreaming with the prompt we can assert on
    vi.mocked(executeStep).mockImplementation(async (_config, step, statusFile, taskStatus, projectRoot, originalTaskContent, sequenceStatusFile, isSequenceSubTask, context) => {
      // Call runStreaming like the real executeStep would
      const prompt = vi.mocked(assemblePrompt).mock.results[0]?.value || 'default prompt';
      await runStreaming('claude', [], '', '', '', prompt);
    });
    // contextProviders is an object, not a function
    
    // Mock path.join
    vi.mocked(path.join).mockImplementation((...parts) => parts.join('/'));
    vi.mocked(path.dirname).mockImplementation((p) => p.substring(0, p.lastIndexOf('/')));

    // Mock reading the task file content
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (path.toString().endsWith('.md') && !path.toString().includes('commands')) {
        return MOCK_TASK_CONTENT;
      }
      // For interaction-intro.md template
      return 'Interaction instructions';
    });
  });

  it('should execute a stepless pipeline with a simplified prompt', async () => {
    // ARRANGE: Set up a config with a stepless pipeline
    const mockConfig = {
      statePath: '.cat-herder/state',
      logsPath: '.cat-herder/logs',
      pipelines: {
        'docs-only': [
          {
            name: 'update_docs',
            command: 'self',
            check: { type: 'none' },
          },
        ],
      },
    };
    vi.mocked(getConfig).mockResolvedValue(mockConfig as any);
    
    // ARRANGE: Mock the task file to use this pipeline
    const taskFileContentWithFrontmatter = `---
pipeline: docs-only
---
${MOCK_TASK_CONTENT}`;
    vi.mocked(readFileSync).mockReturnValue(taskFileContentWithFrontmatter);

    // Override the assemblePrompt mock to return content that we can test
    const expectedPromptContent = `--- YOUR TASK ---\n${MOCK_TASK_CONTENT}`;
    vi.mocked(assemblePrompt).mockReturnValue(expectedPromptContent);

    // ACT: Run the pipeline for the task
    await executePipelineForTask('/test/project/tasks/update-readme.md', { pipelineOption: 'docs-only' });
    
    // ASSERT
    // 1. Verify that assemblePrompt was called with the stepless pipeline
    expect(assemblePrompt).toHaveBeenCalled();
    const assemblePromptCall = vi.mocked(assemblePrompt).mock.calls[0];
    const pipeline = assemblePromptCall[0];
    expect(pipeline).toHaveLength(1); // Stepless pipeline should have only 1 step
    expect(pipeline[0].command).toBe('self');
    
    // 2. Verify that executeStep was called
    expect(executeStep).toHaveBeenCalled();
    
    // 3. Verify that runStreaming was called with the expected prompt
    expect(runStreaming).toHaveBeenCalledOnce();
    const capturedPrompt = vi.mocked(runStreaming).mock.calls[0][5];
    expect(capturedPrompt).toBe(expectedPromptContent);
  });

  it('should not load any command files for a stepless pipeline', async () => {
     const mockConfig = {
      statePath: '.cat-herder/state',
      logsPath: '.cat-herder/logs',
      pipelines: {
        'just-do-it': [{ name: 'execute', command: 'self', check: { type: 'none' }}],
      },
    };
    vi.mocked(getConfig).mockResolvedValue(mockConfig as any);
    
    const readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
    
    await executePipelineForTask('/test/project/tasks/some-task.md', { pipelineOption: 'just-do-it' });
    
    // Assert that readFileSync was NOT called on any path inside '.claude/commands/'
    const commandFileReadCall = readFileSyncSpy.mock.calls.find(call => 
      call[0].toString().includes('.claude/commands/')
    );
    expect(commandFileReadCall).toBeUndefined();
  });
});