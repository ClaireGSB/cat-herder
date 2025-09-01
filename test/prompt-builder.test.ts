// test/prompt-builder.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(),
    },
  };
});

import fs from 'node:fs';
import { assemblePrompt, parseTaskFrontmatter } from '../src/tools/orchestration/prompt-builder.js';
import { PipelineStep } from '../src/config.js';

vi.mock('../src/config.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/config.js')>();
  return {
    ...original,
    getPromptTemplatePath: vi.fn(),
  };
});
import { getPromptTemplatePath } from '../src/config.js';

describe('Prompt Builder', () => {
  const mockPipeline: PipelineStep[] = [
    { name: 'plan', command: 'plan', check: { type: 'none' } },
    { name: 'implement', command: 'implement', check: { type: 'none' } },
  ];
  const mockContext = { 'Task Definition': 'Do the thing.' };
  const mockCommandInstructions = 'Your instructions here.';
  const MOCK_PROMPT_TEMPLATE = 'Autonomy instructions for level %%AUTONOMY_LEVEL%%.';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPromptTemplatePath).mockReturnValue('mocked/path/interaction-intro.md');
    vi.mocked(fs.readFileSync).mockReturnValue(MOCK_PROMPT_TEMPLATE);
  });

  describe('assemblePrompt', () => {
    it('should correctly inject the autonomyLevel into the prompt template', () => {
      const result = assemblePrompt(mockPipeline, 'implement', mockContext, mockCommandInstructions, 4);
      expect(result).toContain('Autonomy instructions for level 4.');
    });

    it('should correctly inject level 0 when no level is provided', () => {
      const result = assemblePrompt(mockPipeline, 'implement', mockContext, mockCommandInstructions);
      expect(result).toContain('Autonomy instructions for level 0.');
    });

    it('should assemble all parts of the prompt in the correct order', () => {
      const result = assemblePrompt(mockPipeline, 'implement', mockContext, mockCommandInstructions, 3);
      const introIndex = result.indexOf('Here is a task');
      const autonomyIndex = result.indexOf('Autonomy instructions for level 3.');
      const pipelineIndex = result.indexOf('This is the full pipeline');
      const responsibilityIndex = result.indexOf('You are responsible for executing step "implement"');
      const contextIndex = result.indexOf('--- TASK DEFINITION ---');

      expect(introIndex).toBe(0);
      expect(autonomyIndex).toBeGreaterThan(introIndex);
      expect(pipelineIndex).toBeGreaterThan(autonomyIndex);
      expect(responsibilityIndex).toBeGreaterThan(pipelineIndex);
      expect(contextIndex).toBeGreaterThan(responsibilityIndex);
    });
  });

  describe('parseTaskFrontmatter', () => {
    it('should parse autonomy level from YAML frontmatter', () => {
      const taskContent = `---
pipeline: default
autonomyLevel: 4
---
# Test Task`;
      const result = parseTaskFrontmatter(taskContent);
      expect(result.autonomyLevel).toBe(4);
    });

    it('should handle backward compatibility for interactionThreshold', () => {
      const taskContent = `---
interactionThreshold: 3
---
# Old Task`;
      const result = parseTaskFrontmatter(taskContent);
      expect(result.autonomyLevel).toBe(3);
    });
  });
});
