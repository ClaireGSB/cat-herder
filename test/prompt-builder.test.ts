import { describe, it, expect } from 'vitest';
import { assemblePrompt, parseTaskFrontmatter } from '../src/tools/orchestration/prompt-builder.js';
import { PipelineStep } from '../src/config.js';

describe('Prompt Builder', () => {
  const mockPipeline: PipelineStep[] = [
    {
      name: 'plan',
      command: 'plan-task',
      check: { type: 'fileExists', path: 'PLAN.md' }
    },
    {
      name: 'implement',
      command: 'implement',
      check: { type: 'shell', command: 'npm test', expect: 'pass' }
    },
    {
      name: 'review',
      command: 'self-review',
      check: { type: 'none' }
    }
  ];

  const mockContext = {
    'Task Definition': 'Create a new user authentication feature',
    'Current Status': 'Step 2 of 3 in progress'
  };

  const mockCommandInstructions = 'Implement the user authentication feature as described in the task definition.';

  describe('assemblePrompt', () => {
    it('should include interaction threshold instructions when threshold > 0', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions,
        3
      );

      expect(result).toContain('You are operating at an interaction threshold of 3/5');
      expect(result).toContain('A threshold of 0 means you must never ask for clarification');
      expect(result).toContain('A threshold of 5 means you must use the `askHuman(question: string)` tool');
      expect(result).toContain('When you use `askHuman`, your work will pause until a human provides an answer');
    });

    it('should include interaction threshold instructions when threshold is 0', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions,
        0
      );

      expect(result).toContain('You are operating at an interaction threshold of 0/5');
      expect(result).toContain('A threshold of 0 means you must never ask for clarification');
    });

    it('should include interaction threshold instructions when threshold is maximum (5)', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions,
        5
      );

      expect(result).toContain('You are operating at an interaction threshold of 5/5');
      expect(result).toContain('A threshold of 5 means you must use the `askHuman(question: string)` tool whenever you face a choice or ambiguity');
    });

    it('should default to threshold 0 when no threshold is provided', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions
        // No threshold parameter provided
      );

      expect(result).toContain('You are operating at an interaction threshold of 0/5');
    });

    it('should include all required prompt sections', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions,
        2
      );

      // Check that all major sections are present
      expect(result).toContain('Here is a task that has been broken down into several steps');
      expect(result).toContain('This is the full pipeline for your awareness:');
      expect(result).toContain('1. plan');
      expect(result).toContain('2. implement');
      expect(result).toContain('3. review');
      expect(result).toContain('You are responsible for executing step "implement"');
      expect(result).toContain('--- TASK DEFINITION ---');
      expect(result).toContain('Create a new user authentication feature');
      expect(result).toContain('--- YOUR INSTRUCTIONS FOR THE "implement" STEP ---');
      expect(result).toContain(mockCommandInstructions);
    });

    it('should properly structure the interaction threshold instructions', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions,
        3
      );

      // The interaction intro should come after the main intro but before pipeline context
      const lines = result.split('\n\n');
      const introIndex = lines.findIndex(line => line.includes('Here is a task that has been broken down'));
      const interactionIndex = lines.findIndex(line => line.includes('You are operating at an interaction threshold'));
      const pipelineIndex = lines.findIndex(line => line.includes('This is the full pipeline'));

      expect(introIndex).toBeLessThan(interactionIndex);
      expect(interactionIndex).toBeLessThan(pipelineIndex);
    });

    it('should handle different threshold values correctly', () => {
      const thresholds = [0, 1, 2, 3, 4, 5];

      thresholds.forEach(threshold => {
        const result = assemblePrompt(
          mockPipeline,
          'implement',
          mockContext,
          mockCommandInstructions,
          threshold
        );

        expect(result).toContain(`You are operating at an interaction threshold of ${threshold}/5`);
      });
    });
  });

  describe('parseTaskFrontmatter', () => {
    it('should parse interaction threshold from YAML frontmatter', () => {
      const taskContent = `---
pipeline: default
interactionThreshold: 4
---
# Test Task

This is a test task with interaction threshold.`;

      const result = parseTaskFrontmatter(taskContent);

      expect(result.pipeline).toBe('default');
      expect(result.interactionThreshold).toBe(4);
      expect(result.body).toBe('# Test Task\n\nThis is a test task with interaction threshold.');
    });

    it('should handle missing interaction threshold in frontmatter', () => {
      const taskContent = `---
pipeline: custom
---
# Test Task

This task has no interaction threshold specified.`;

      const result = parseTaskFrontmatter(taskContent);

      expect(result.pipeline).toBe('custom');
      expect(result.interactionThreshold).toBeUndefined();
      expect(result.body).toBe('# Test Task\n\nThis task has no interaction threshold specified.');
    });

    it('should handle tasks with no frontmatter', () => {
      const taskContent = `# Simple Task

This task has no YAML frontmatter.`;

      const result = parseTaskFrontmatter(taskContent);

      expect(result.pipeline).toBeUndefined();
      expect(result.interactionThreshold).toBeUndefined();
      expect(result.body).toBe(taskContent);
    });

    it('should handle interaction threshold as the only frontmatter property', () => {
      const taskContent = `---
interactionThreshold: 2
---
# Threshold Only Task

This task only specifies an interaction threshold.`;

      const result = parseTaskFrontmatter(taskContent);

      expect(result.pipeline).toBeUndefined();
      expect(result.interactionThreshold).toBe(2);
      expect(result.body).toBe('# Threshold Only Task\n\nThis task only specifies an interaction threshold.');
    });

    it('should handle invalid YAML frontmatter gracefully', () => {
      const taskContent = `---
invalid: yaml: content: 
  - malformed
---
# Task with Invalid YAML

This should still work.`;

      const result = parseTaskFrontmatter(taskContent);

      expect(result.pipeline).toBeUndefined();
      expect(result.interactionThreshold).toBeUndefined();
      expect(result.body).toBe(taskContent);
    });
  });
});