import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('node:fs');
vi.mock('../src/tools/proc.js');
vi.mock('../src/tools/status.js');
vi.mock('../src/config.js');
vi.mock('../src/tools/check-runner.js');

// Import the real functions we want to test
import { executePipelineForTask } from '../src/tools/orchestration/pipeline-runner.js';
import { runStreaming } from '../src/tools/proc.js';
// Import all the functions from config.js that are used by the code under test
import { getProjectRoot, getConfig, resolveDataPath, getPromptTemplatePath } from '../src/config.js';
import { readStatus, updateStatus } from '../src/tools/status.js';
import { runCheck } from '../src/tools/check-runner.js';
import { mkdirSync, readFileSync } from 'node:fs';

describe('Orchestrator - Stepless Pipeline Execution', () => {
  const MOCK_TASK_CONTENT_BODY = '# A Simple Documentation Task\n\nPlease update the README.md file to include a section on the new stepless pipeline feature.';
  
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks for a successful run
    vi.mocked(getProjectRoot).mockReturnValue('/test/project');
    vi.mocked(resolveDataPath).mockImplementation((basePath, root) => path.join(root || '', basePath.replace('~', '/home/user')));
    
    vi.mocked(getPromptTemplatePath).mockReturnValue('/test/project/src/tools/prompts/interaction-intro.md');

    vi.mocked(readStatus).mockReturnValue({ taskId: 'test-task', steps: {}, interactionHistory: [] } as any);
    vi.mocked(updateStatus).mockImplementation(() => {});
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(runCheck).mockResolvedValue({ success: true });
    
    // The key is to only mock the final call to the AI
    vi.mocked(runStreaming).mockResolvedValue({ code: 0, output: 'Done.' });

    // Mock reading files. This is necessary because the real functions need them.
    vi.mocked(readFileSync).mockImplementation((filePath: any) => {
      // --- Safer check to prevent toString() on undefined ---
      const pathStr = filePath ? filePath.toString() : '';

      if (pathStr.endsWith('interaction-intro.md')) {
        return 'Interaction instructions';
      }
      // Return the full task content, including frontmatter
      return `---
pipeline: docs-only
---
${MOCK_TASK_CONTENT_BODY}`;
    });
  });

  it('should execute a stepless pipeline and pass a simplified prompt to the AI', async () => {
    // ARRANGE: Set up a config with a valid stepless pipeline
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
    
    // ACT: Run the orchestrator's pipeline execution function.
    await executePipelineForTask('/test/project/tasks/update-readme.md', { pipelineOption: 'docs-only' });
    
    // ASSERT
    // 1. Verify that the call to the AI was made.
    expect(runStreaming).toHaveBeenCalledOnce();

    // 2. Capture the prompt that was ACTUALLY generated and passed to the AI.
    const capturedPrompt = vi.mocked(runStreaming).mock.calls[0][5];
    
    // 3. (Robust) Assert that the prompt uses the simplified prompt's unique structure.
    expect(capturedPrompt).toContain('--- YOUR TASK ---');
    expect(capturedPrompt).toContain(MOCK_TASK_CONTENT_BODY);
    
    // 4. (Robust & Non-Brittle) Assert that the prompt does NOT use the multi-step prompt's unique structure.
    //    This is much better because it checks for a structural element, not arbitrary text.
    expect(capturedPrompt).not.toContain('--- YOUR INSTRUCTIONS FOR THE');
  });
});