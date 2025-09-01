

#### How to Fix `orchestrator-stepless.test.ts`

To make this test robust and meaningful, we need to test the function's behavior, not its internal calls. We should let `executePipelineForTask` run its course and only mock the lowest-level dependency: the actual call to the AI (`runStreaming`).

Here is a corrected, non-brittle version of `test/orchestrator-stepless.test.ts` that you can provide to the developer to replace the current one.

**Corrected Code for `test/orchestrator-stepless.test.ts`:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

// Mock fewer, lower-level dependencies
vi.mock('node:fs');
vi.mock('../src/tools/proc.js');
vi.mock('../src/tools/status.js');
vi.mock('../src/config.js');
vi.mock('../src/tools/check-runner.js');

// Import the real functions we want to test
import { executePipelineForTask } from '../src/tools/orchestration/pipeline-runner.js';
import { runStreaming } from '../src/tools/proc.js';
import { getProjectRoot, getConfig } from '../src/config.js';
import { readStatus, updateStatus } from '../src/tools/status.js';
import { runCheck } from '../src/tools/check-runner.js';
import { mkdirSync, readFileSync } from 'node:fs';

describe('Orchestrator - Stepless Pipeline Execution', () => {
  const MOCK_TASK_CONTENT_BODY = '# A Simple Documentation Task\n\nPlease update the README.md file to include a section on the new stepless pipeline feature.';
  
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks for a successful run
    vi.mocked(getProjectRoot).mockReturnValue('/test/project');
    vi.mocked(readStatus).mockReturnValue({ taskId: 'test-task', steps: {}, interactionHistory: [] } as any);
    vi.mocked(updateStatus).mockImplementation(() => {});
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(runCheck).mockResolvedValue({ success: true });
    
    // The key is to only mock the final call to the AI
    vi.mocked(runStreaming).mockResolvedValue({ code: 0, output: 'Done.' });

    // Mock reading files. This is necessary because the real functions need them.
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (path.toString().endsWith('interaction-intro.md')) {
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
    
    // ACT: Run the orchestrator's pipeline execution function. This is the function we are testing.
    await executePipelineForTask('/test/project/tasks/update-readme.md', { pipelineOption: 'docs-only' });
    
    // ASSERT
    // 1. Verify that the call to the AI was made.
    expect(runStreaming).toHaveBeenCalledOnce();

    // 2. Capture the prompt (`stdinData`) that was ACTUALLY generated and passed to the AI.
    const capturedPrompt = vi.mocked(runStreaming).mock.calls[0][5];
    
    // 3. Assert that the prompt has the simplified structure and content.
    expect(capturedPrompt).toContain('--- YOUR TASK ---');
    expect(capturedPrompt).toContain(MOCK_TASK_CONTENT_BODY);
    
    // 4. Assert that the prompt does NOT contain the multi-step boilerplate.
    expect(capturedPrompt).not.toContain('This is the full pipeline for your awareness');
    expect(capturedPrompt).not.toContain('You are responsible for executing step');
  });
});
```

### Summary

*   **Unit Tests (`validator`, `prompt-builder`):** The developer did an excellent job. These tests are well-written, non-brittle, and correctly verify the new logic.
*   **Integration Test (`orchestrator-stepless`):** The developer's approach was flawed and needs to be replaced with the corrected version above.

Overall, the developer is very close. With the corrected integration test, the test suite for this feature will be robust and complete.