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
    it('should include autonomy level instructions when autonomyLevel > 0', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions,
        3
      );

      expect(result).toContain('Your Autonomy Level is set to 3');
      expect(result).toContain('Balanced Autonomy');
      expect(result).toContain('When you need to ask a clarifying question, you MUST use the Bash tool');
    });

    it('should include autonomy level instructions when autonomyLevel is 0', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions,
        0
      );

      // For autonomyLevel 0, no autonomy instructions should be included
      expect(result).not.toContain('Autonomy Level');
      expect(result).not.toContain('ask a clarifying question');
    });

    it('should include autonomy level instructions when threshold is maximum (5)', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions,
        5
      );

      expect(result).toContain('Your Autonomy Level is set to 5');
      expect(result).toContain('Guided Execution');
      expect(result).toContain('Ask questions to clarify any ambiguity, no matter how small');
    });

    it('should default to threshold 0 when no threshold is provided', () => {
      const result = assemblePrompt(
        mockPipeline,
        'implement',
        mockContext,
        mockCommandInstructions
        // No threshold parameter provided
      );

      // For threshold 0, no interaction instructions should be included
      expect(result).not.toContain('Autonomy Level');
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

    it('should properly structure the autonomy level instructions', () => {
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
      const interactionIndex = lines.findIndex(line => line.includes('Your Autonomy Level is set to'));
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

        if (threshold === 0) {
          expect(result).not.toContain('Autonomy Level');
        } else {
          expect(result).toContain(`Your Autonomy Level is set to ${threshold}`);
        }
      });
    });
  });

  describe('parseTaskFrontmatter', () => {
    it('should parse autonomy level from YAML frontmatter', () => {
      const taskContent = `---
pipeline: default
autonomyLevel: 4
---
# Test Task

This is a test task with autonomy level.`;

      const result = parseTaskFrontmatter(taskContent);

      expect(result.pipeline).toBe('default');
      expect(result.autonomyLevel).toBe(4);
      expect(result.body).toBe('# Test Task\n\nThis is a test task with autonomy level.');
    });

    it('should handle missing autonomy level in frontmatter', () => {
      const taskContent = `---
pipeline: custom
---
# Test Task

This task has no autonomy level specified.`;

      const result = parseTaskFrontmatter(taskContent);

      expect(result.pipeline).toBe('custom');
      expect(result.autonomyLevel).toBeUndefined();
      expect(result.body).toBe('# Test Task\n\nThis task has no autonomy level specified.');
    });

    it('should handle tasks with no frontmatter', () => {
      const taskContent = `# Simple Task

This task has no YAML frontmatter.`;

      const result = parseTaskFrontmatter(taskContent);

      expect(result.pipeline).toBeUndefined();
      expect(result.autonomyLevel).toBeUndefined();
      expect(result.body).toBe(taskContent);
    });

    it('should handle autonomy level as the only frontmatter property', () => {
      const taskContent = `---
autonomyLevel: 2
---
# Threshold Only Task

This task only specifies an autonomy level.`;

      const result = parseTaskFrontmatter(taskContent);

      expect(result.pipeline).toBeUndefined();
      expect(result.autonomyLevel).toBe(2);
      expect(result.body).toBe('# Threshold Only Task\n\nThis task only specifies an autonomy level.');
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
      expect(result.autonomyLevel).toBeUndefined();
      expect(result.body).toBe(taskContent);
    });
  });
});