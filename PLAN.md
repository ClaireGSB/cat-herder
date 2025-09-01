
# PLAN: Add Non-Brittle Tests for Stepless Pipeline Feature

## Title & Goal

**Title:** Add Non-Brittle Tests for Stepless Pipeline Feature
**Goal:** To ensure the new single-step pipeline feature is reliable and to prevent future regressions by adding comprehensive, non-brittle tests.

## Testing Strategy

To ensure the feature works correctly from end-to-end, we will add tests at three key levels:

1.  **Integration Test (Orchestrator):** We'll create a new test to verify that when the orchestrator is given a "stepless" task, it correctly processes it and calls the AI with the right simplified prompt. This confirms the main logic works as expected.
2.  **Unit Test (Validator):** We'll add a new test suite to verify that our configuration validator correctly accepts valid "stepless" pipelines and rejects invalid ones (e.g., a stepless pipeline with more than one step).
3.  **Unit Test (Prompt Builder):** We'll refactor the existing prompt builder tests to be more robust. We will create two distinct test suites: one that confirms the detailed prompt is still generated for multi-step pipelines, and a new one that confirms the simplified prompt is generated for single-step pipelines.

This approach ensures our tests are fast, reliable, and not "brittle" (meaning they won't break easily with minor, unrelated code changes).

## Summary Checklist

-   [ ] **Step 1:** Create the new orchestrator integration test file.
-   [ ] **Step 2:** Add the new unit test suite to the validator test file.
-   [ ] **Step 3:** Refactor and update the prompt builder test file.
-   [ ] **Step 4:** Run all tests to confirm everything passes.

## Detailed Implementation Steps

### Step 1: Create the Orchestrator Integration Test

-   **Objective:** Verify the entire end-to-end logic for a stepless pipeline, from configuration to the final prompt sent to the AI.
-   **Task:** Create a new file named `test/orchestrator-stepless.test.ts`. Copy and paste the entire code block below into this new file.

-   **Code for `test/orchestrator-stepless.test.ts`:**
    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import { readFileSync, mkdirSync } from 'node:fs';

    // Mock dependencies
    vi.mock('node:fs');
    vi.mock('../src/tools/proc.js');
    vi.mock('../src/tools/status.js');
    vi.mock('../src/config.js');
    vi.mock('../src/tools/check-runner.js');

    // Import functions after mocking
    const { runStreaming } = await import('../src/tools/proc.js');
    const { updateStatus, readStatus } = await import('../src/tools/status.js');
    const { getProjectRoot, getConfig } = await import('../src/config.js');
    const { runCheck } = await import('../src/tools/check-runner.js');
    const { executePipelineForTask } = await import('../src/tools/orchestration/pipeline-runner.js');

    describe('Orchestrator - Stepless Pipeline Execution', () => {
      const MOCK_TASK_CONTENT = '# A Simple Documentation Task\n\nPlease update the README.md file to include a section on the new stepless pipeline feature.';
      
      beforeEach(() => {
        vi.clearAllMocks();

        // Setup default mocks for a successful run
        vi.mocked(getProjectRoot).mockReturnValue('/test/project');
        vi.mocked(readStatus).mockReturnValue({ taskId: 'test-task', steps: {}, interactionHistory: [] } as any);
        vi.mocked(updateStatus).mockImplementation(() => {});
        vi.mocked(mkdirSync).mockImplementation(() => undefined);
        vi.mocked(runCheck).mockResolvedValue({ success: true });
        vi.mocked(runStreaming).mockResolvedValue({ code: 0, output: 'Done.' });

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

        // ACT: Run the pipeline for the task
        await executePipelineForTask('/test/project/tasks/update-readme.md', { pipelineOption: 'docs-only' });
        
        // ASSERT
        // 1. Verify that runStreaming was called.
        expect(runStreaming).toHaveBeenCalledOnce();

        // 2. Capture the prompt (`stdinData`) passed to runStreaming. This is the key assertion.
        const capturedPrompt = vi.mocked(runStreaming).mock.calls[0][5];
        
        // 3. Assert that the prompt is the *simplified* version.
        expect(capturedPrompt).toContain('--- YOUR TASK ---');
        expect(capturedPrompt).toContain(MOCK_TASK_CONTENT);
        
        // 4. Assert that the prompt does NOT contain the multi-step boilerplate.
        expect(capturedPrompt).not.toContain('This is the full pipeline for your awareness');
        expect(capturedPrompt).not.toContain('You are responsible for executing step');
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
    ```

### Step 2: Add Validator Unit Tests

-   **Objective:** To confirm that the configuration validator correctly enforces the new rule that a pipeline with `command: "self"` must contain only one step.
-   **Task:** Open the existing file `test/validator.test.ts`. At the very end of the file, paste the new `describe` block provided below.

-   **Code to add to `test/validator.test.ts`:**
    ```typescript
    describe('Validator - Stepless Pipeline ("self" command) Validation', () => {
      const mockProjectRoot = '/test/project';

      beforeEach(() => {
        vi.clearAllMocks();
        // Mock basic file existence so the validator can run
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathLike) => {
          if (filePath.toString().includes('settings.json')) {
            return JSON.stringify({ permissions: { allow: ['Bash(cat-herder ask:*)'] } });
          }
          if (filePath.toString().includes('package.json')) {
            return JSON.stringify({ scripts: {} });
          }
          return '';
        });
      });

      it('should accept a valid stepless pipeline with a single "self" command step', () => {
        const config = createBaseConfig({
          pipelines: {
            'just-do-it': [
              {
                name: 'execute',
                command: 'self',
                check: { type: 'none' },
              },
            ],
          },
        });

        const result = validatePipeline(config, mockProjectRoot);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject a pipeline with a "self" command and other steps', () => {
        const config = createBaseConfig({
          pipelines: {
            'invalid-pipeline': [
              {
                name: 'execute',
                command: 'self',
                check: { type: 'none' },
              },
              {
                name: 'another-step',
                command: 'another-command',
                check: { type: 'none' },
              },
            ],
          },
        });

        const result = validatePipeline(config, mockProjectRoot);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(
          `Pipeline 'invalid-pipeline': A pipeline using 'command: "self"' can only contain a single step.`
        );
      });

      it('should still validate other properties on a valid stepless pipeline', () => {
        const config = createBaseConfig({
          pipelines: {
            'stepless-with-error': [
              {
                name: 'execute',
                command: 'self',
                check: { type: 'shell' }, // Invalid: missing 'command'
                retry: 'bad' as any, // Invalid: should be a number
              },
            ],
          },
        });

        const result = validatePipeline(config, mockProjectRoot);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(
          "Pipeline 'stepless-with-error', Step 1 ('execute'): Check type 'shell' requires a non-empty 'command' string property."
        );
        expect(result.errors).toContain(
          "Pipeline 'stepless-with-error', Step 1 ('execute'): The 'retry' property must be a non-negative integer, but found 'bad'."
        );
      });

      it('should correctly identify a normal pipeline as valid', () => {
        const config = createBaseConfig({
          pipelines: {
            default: [
              { name: 'plan', command: 'plan-task', check: { type: 'none' } },
              { name: 'implement', command: 'implement', check: { type: 'none' } },
            ],
          },
        });
         // Mock command files as existing
        vi.mocked(fs.existsSync).mockImplementation((p) => p.toString().includes('.md'));

        const result = validatePipeline(config, mockProjectRoot);
        expect(result.isValid).toBe(true);
      });
    });
    ```

### Step 3: Refactor and Update Prompt Builder Tests

-   **Objective:** To update the existing tests to be more robust and to add new tests that verify the simplified prompt generation for stepless tasks.
-   **Task:** Open the file `test/prompt-builder.test.ts`. **Replace the entire content of the file** with the code block below. This will safely restructure the old tests and add the new ones.

-   **Code for `test/prompt-builder.test.ts` (replace all):**
    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import fs from 'node:fs';
    import { assemblePrompt, parseTaskFrontmatter } from '../src/tools/orchestration/prompt-builder.js';
    import { PipelineStep } from '../src/config.js';
    import { getPromptTemplatePath } from '../src/config.js';

    vi.mock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return { ...actual, default: { ...actual, readFileSync: vi.fn() } };
    });

    vi.mock('../src/config.js', async (importOriginal) => {
      const original = await importOriginal<typeof import('../src/config.js')>();
      return { ...original, getPromptTemplatePath: vi.fn() };
    });

    describe('Prompt Builder', () => {
      const MOCK_PROMPT_TEMPLATE = 'Interaction instructions for level %%INTERACTION_THRESHOLD%%.';

      beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getPromptTemplatePath).mockReturnValue('mocked/path/interaction-intro.md');
        vi.mocked(fs.readFileSync).mockReturnValue(MOCK_PROMPT_TEMPLATE);
      });

      describe('Multi-Step Pipelines', () => {
        const mockPipeline: PipelineStep[] = [
          { name: 'plan', command: 'plan', check: { type: 'none' } },
          { name: 'implement', command: 'implement', check: { type: 'none' } },
        ];
        const mockContext = { 'Task Definition': 'Do the thing.' };
        const mockCommandInstructions = 'Your instructions here.';

        it('should assemble all parts of the detailed prompt in the correct order', () => {
          const result = assemblePrompt(mockPipeline, 'implement', mockContext, mockCommandInstructions, 3);

          expect(result).toContain('Here is a task that has been broken down into several steps');
          expect(result).toContain('This is the full pipeline for your awareness');
          expect(result).toContain('You are responsible for executing step "implement"');
          expect(result).toContain('--- TASK DEFINITION ---');
          
          const introIndex = result.indexOf('Here is a task');
          const pipelineIndex = result.indexOf('This is the full pipeline');
          const responsibilityIndex = result.indexOf('You are responsible for executing step');
          expect(pipelineIndex).toBeGreaterThan(introIndex);
          expect(responsibilityIndex).toBeGreaterThan(pipelineIndex);
        });
      });

      describe('Single-Step ("Stepless") Pipelines', () => {
        it('should generate a simplified prompt', () => {
          const steplessPipeline: PipelineStep[] = [
            { name: 'execute', command: 'self', check: { type: 'none' } },
          ];
          const taskContent = '# My Simple Task\n\nJust do this one thing.';
          const context = {};

          const result = assemblePrompt(steplessPipeline, 'execute', context, taskContent, 0);

          expect(result).toContain('--- YOUR TASK ---');
          expect(result).toContain(taskContent);
          expect(result).not.toContain('This is the full pipeline for your awareness');
          expect(result).not.toContain('You are responsible for executing step');
        });

         it('should include interaction history in a simplified prompt if it exists', () => {
          const steplessPipeline: PipelineStep[] = [
            { name: 'execute', command: 'self', check: { type: 'none' } },
          ];
          const taskContent = 'My task content.';
          const context = { interactionHistory: 'Q: What?\nA: That.' };

          const result = assemblePrompt(steplessPipeline, 'execute', context, taskContent, 0);

          expect(result).toContain('--- HUMAN INTERACTION HISTORY ---');
          expect(result).toContain('--- YOUR TASK ---');
        });
      });
      
      describe('parseTaskFrontmatter', () => {
        it('should parse autonomy level and pipeline from YAML frontmatter', () => {
          const taskContent = `---
    pipeline: default
    interactionThreshold: 4
    ---
    # Test Task`;
          const result = parseTaskFrontmatter(taskContent);
          expect(result.interactionThreshold).toBe(4);
          expect(result.pipeline).toBe('default');
        });
      });
    });
    ```

### Step 4: Final Verification

-   **Objective:** To ensure that all new tests pass and that no existing tests were broken by the changes.
-   **Task:** Run the entire test suite from your terminal.

-   **Command:**
    ```bash
    npm test
    ```
-   **Expected Result:** All tests should pass. If any tests fail, carefully review the error messages. They will likely point to a small typo or an issue in the implementation steps.