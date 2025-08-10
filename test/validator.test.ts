import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validatePipeline, ValidationResult } from '../src/tools/validator.js';
import { ClaudeProjectConfig } from '../src/config.js';
import fs from 'fs';
import path from 'path';

// Mock filesystem functions
vi.mock('fs');

describe('Validator - Retry Property Validation', () => {
  const mockProjectRoot = '/test/project';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock settings.json exists with basic permissions
    vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
      if (filePath.includes('settings.json')) return true;
      if (filePath.includes('package.json')) return true;
      if (filePath.includes('commands')) return true; // Mock command files exist
      return false;
    });
    
    // Mock file reads
    vi.mocked(fs.readFileSync).mockImplementation((filePath: string, encoding: any) => {
      if (filePath.includes('settings.json')) {
        return JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } });
      }
      if (filePath.includes('package.json')) {
        return JSON.stringify({ scripts: { test: 'vitest' } });
      }
      if (filePath.includes('commands')) {
        return '---\nallowed-tools: []\n---\nTest command content';
      }
      return '';
    });
  });

  it('should accept valid retry values', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: 3
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('retry'));
  });

  it('should accept retry value of 0', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: 0
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('retry'));
  });

  it('should accept missing retry property', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
            // No retry property - should be valid
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('retry'));
  });

  it('should reject string retry values', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: '3' as any // Invalid string value
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '3'."
    );
  });

  it('should reject negative retry values', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: -1
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '-1'."
    );
  });

  it('should reject decimal retry values', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: 1.5
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '1.5'."
    );
  });

  it('should reject null retry values', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: null as any
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found 'null'."
    );
  });

  it('should reject object retry values', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: {} as any
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '[object Object]'."
    );
  });

  it('should reject array retry values', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: [3] as any
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '3'."
    );
  });

  it('should handle multiple validation errors including retry', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        default: [
          {
            name: '', // Missing name
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: 'invalid' as any
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): is missing the 'name' property."
    );
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): The 'retry' property must be a non-negative integer, but found 'invalid'."
    );
  });

  it('should validate retry in multiple pipelines', () => {
    const config: ClaudeProjectConfig = {
      pipelines: {
        pipeline1: [
          {
            name: 'step1',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: 2
          }
        ],
        pipeline2: [
          {
            name: 'step2',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: 'bad' as any
          }
        ]
      }
    };

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'pipeline2', Step 1 ('step2'): The 'retry' property must be a non-negative integer, but found 'bad'."
    );
    // Should not contain errors for the valid pipeline1
    expect(result.errors.filter(err => err.includes('pipeline1'))).toHaveLength(0);
  });
});