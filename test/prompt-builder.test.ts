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
  const MOCK_PROMPT_TEMPLATE = 'Interaction instructions for level %%AUTONOMY_LEVEL%%.';

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
      expect(result.autonomyLevel).toBe(4);
      expect(result.pipeline).toBe('default');
    });
  });
});