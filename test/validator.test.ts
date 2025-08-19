import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validatePipeline, ValidationResult } from '../src/tools/validator.js';
import { ClaudeProjectConfig } from '../src/config.js';
import fs from 'fs';
import path from 'path';

// Mock filesystem functions
vi.mock('fs');

// Helper function to create a valid base config
function createBaseConfig(overrides: Partial<ClaudeProjectConfig> = {}): ClaudeProjectConfig {
  return {
    taskFolder: "cat-herder-tasks",
    statePath: "~/.cat-herder/state",
    logsPath: "~/.cat-herder/logs",
    structureIgnore: ["node_modules/**", ".git/**", "dist/**"],
    ...overrides
  };
}

describe('Validator - Retry Property Validation', () => {
  const mockProjectRoot = '/test/project';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock settings.json exists with basic permissions
    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) return true;
      if (pathStr.includes('package.json')) return true;
      if (pathStr.includes('commands')) return true; // Mock command files exist
      return false;
    });
    
    // Mock file reads
    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathLike, encoding: any) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) {
        return JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } });
      }
      if (pathStr.includes('package.json')) {
        return JSON.stringify({ scripts: { test: 'vitest' } });
      }
      if (pathStr.includes('commands')) {
        return '---\nallowed-tools: []\n---\nTest command content';
      }
      return '';
    });
  });

  it('should accept valid retry values', () => {
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('retry'));
  });

  it('should accept retry value of 0', () => {
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('retry'));
  });

  it('should accept missing retry property', () => {
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('retry'));
  });

  it('should reject string retry values', () => {
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '3'."
    );
  });

  it('should reject negative retry values', () => {
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '-1'."
    );
  });

  it('should reject decimal retry values', () => {
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '1.5'."
    );
  });

  it('should reject null retry values', () => {
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found 'null'."
    );
  });

  it('should reject object retry values', () => {
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '[object Object]'."
    );
  });

  it('should reject array retry values', () => {
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'retry' property must be a non-negative integer, but found '3'."
    );
  });

  it('should handle multiple validation errors including retry', () => {
    const config = createBaseConfig({
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
    });

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
    const config = createBaseConfig({
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
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'pipeline2', Step 1 ('step2'): The 'retry' property must be a non-negative integer, but found 'bad'."
    );
    // Should not contain errors for the valid pipeline1
    expect(result.errors.filter(err => err.includes('pipeline1'))).toHaveLength(0);
  });
});

describe('Validator - Check Object Validation', () => {
  const mockProjectRoot = '/test/project';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock settings.json exists with basic permissions
    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) return true;
      if (pathStr.includes('package.json')) return true;
      if (pathStr.includes('commands')) return true; // Mock command files exist
      return false;
    });
    
    // Mock file reads
    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathLike, encoding: any) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) {
        return JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } });
      }
      if (pathStr.includes('package.json')) {
        return JSON.stringify({ scripts: { test: 'vitest' } });
      }
      if (pathStr.includes('commands')) {
        return '---\nallowed-tools: []\n---\nTest command content';
      }
      return '';
    });
  });

  describe('fileExists check validation', () => {
    it('should accept valid fileExists check with path', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'fileExists', path: 'PLAN.md' }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('fileExists'));
    });

    it('should reject fileExists check without path property', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'fileExists' } as any
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'fileExists' requires a non-empty 'path' string property."
      );
    });

    it('should reject fileExists check with empty path', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'fileExists', path: '' }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'fileExists' requires a non-empty 'path' string property."
      );
    });

    it('should reject fileExists check with non-string path', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'fileExists', path: 123 as any }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'fileExists' requires a non-empty 'path' string property."
      );
    });
  });

  describe('shell check validation', () => {
    it('should accept valid shell check with command and expect', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 'npm test', expect: 'pass' }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('shell'));
    });

    it('should accept valid shell check with command but no expect', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 'npm test' }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('shell'));
    });

    it('should reject shell check without command property', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell' } as any
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'shell' requires a non-empty 'command' string property."
      );
    });

    it('should reject shell check with empty command', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: '' }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'shell' requires a non-empty 'command' string property."
      );
    });

    it('should reject shell check with non-string command', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 42 as any }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'shell' requires a non-empty 'command' string property."
      );
    });

    it('should reject shell check with invalid expect value', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 'npm test', expect: 'success' as any }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): The 'expect' property for a shell check must be either \"pass\" or \"fail\"."
      );
    });

    it('should accept shell check with expect "fail"', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 'npm test', expect: 'fail' }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('expect'));
    });
  });

  describe('none check validation', () => {
    it('should accept none check without additional properties', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'none' }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('none'));
    });
  });

  describe('multiple check validation errors', () => {
    it('should handle multiple check validation errors in same config', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: 'step1',
              command: 'test-command',
              check: { type: 'fileExists' } as any // Missing path
            },
            {
              name: 'step2',
              command: 'test-command',
              check: { type: 'shell', command: 'npm test', expect: 'invalid' as any } // Invalid expect
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('step1'): Check type 'fileExists' requires a non-empty 'path' string property."
      );
      expect(result.errors).toContain(
        "Pipeline 'default', Step 2 ('step2'): The 'expect' property for a shell check must be either \"pass\" or \"fail\"."
      );
    });

    it('should handle check validation alongside other validation errors', () => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: '', // Missing name
              command: 'test-command',
              check: { type: 'shell' }, // Missing command
              retry: 'invalid' as any // Invalid retry
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('unnamed'): is missing the 'name' property."
      );
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('unnamed'): Check type 'shell' requires a non-empty 'command' string property."
      );
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('unnamed'): The 'retry' property must be a non-negative integer, but found 'invalid'."
      );
    });
  });
});

describe('Validator - Model Property Validation', () => {
  const mockProjectRoot = '/test/project';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock settings.json exists with basic permissions
    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) return true;
      if (pathStr.includes('package.json')) return true;
      if (pathStr.includes('commands')) return true; // Mock command files exist
      return false;
    });
    
    // Mock file reads
    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathLike, encoding: any) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) {
        return JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } });
      }
      if (pathStr.includes('package.json')) {
        return JSON.stringify({ scripts: { test: 'vitest' } });
      }
      if (pathStr.includes('commands')) {
        return '---\nallowed-tools: []\n---\nTest command content';
      }
      return '';
    });
  });

  it('should accept valid model name', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            model: 'claude-opus-4-1-20250805',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('model'));
  });

  it('should accept step with no model property', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
            // No model property - should be valid
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('model'));
  });

  it('should accept all valid model names', () => {
    const validModels = [
      'claude-opus-4-1-20250805',
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-haiku-20241022'
    ];

    validModels.forEach((modelName, index) => {
      const config = createBaseConfig({
        pipelines: {
          default: [
            {
              name: `test-step-${index}`,
              command: 'test-command',
              model: modelName,
              check: { type: 'shell', command: 'npm test', expect: 'pass' }
            }
          ]
        }
      });

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('Invalid model name'));
    });
  });

  it('should fail validation for invalid model name', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            model: 'claude-opus-9000', // Invalid model
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): Invalid model name \"claude-opus-9000\". Available models are: claude-opus-4-1-20250805, claude-opus-4-20250514, claude-sonnet-4-20250514, claude-3-7-sonnet-20250219, claude-3-5-haiku-20241022"
    );
  });

  it('should fail validation for misspelled model name', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            model: 'claude-sonnet-4-20250515', // Misspelled (wrong date)
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): Invalid model name \"claude-sonnet-4-20250515\". Available models are: claude-opus-4-1-20250805, claude-opus-4-20250514, claude-sonnet-4-20250514, claude-3-7-sonnet-20250219, claude-3-5-haiku-20241022"
    );
  });

  it('should fail validation for non-string model value', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            model: 123 as any, // Invalid number value
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'model' property must be a string."
    );
  });

  it('should fail validation for null model value', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            model: null as any,
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'model' property must be a string."
    );
  });

  it('should fail validation for empty string model value', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            model: '', // Empty string
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): Invalid model name \"\". Available models are: claude-opus-4-1-20250805, claude-opus-4-20250514, claude-sonnet-4-20250514, claude-3-7-sonnet-20250219, claude-3-5-haiku-20241022"
    );
  });

  it('should handle model validation alongside other validation errors', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: '', // Missing name
            command: 'test-command',
            model: 'invalid-model', // Invalid model
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: 'bad' as any // Invalid retry
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): is missing the 'name' property."
    );
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): Invalid model name \"invalid-model\". Available models are: claude-opus-4-1-20250805, claude-opus-4-20250514, claude-sonnet-4-20250514, claude-3-7-sonnet-20250219, claude-3-5-haiku-20241022"
    );
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): The 'retry' property must be a non-negative integer, but found 'bad'."
    );
  });

  it('should validate model in multiple pipelines', () => {
    const config = createBaseConfig({
      pipelines: {
        pipeline1: [
          {
            name: 'step1',
            command: 'test-command',
            model: 'claude-opus-4-1-20250805', // Valid
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ],
        pipeline2: [
          {
            name: 'step2',
            command: 'test-command',
            model: 'claude-invalid-model', // Invalid
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'pipeline2', Step 1 ('step2'): Invalid model name \"claude-invalid-model\". Available models are: claude-opus-4-1-20250805, claude-opus-4-20250514, claude-sonnet-4-20250514, claude-3-7-sonnet-20250219, claude-3-5-haiku-20241022"
    );
    // Should not contain errors for the valid pipeline1
    expect(result.errors.filter(err => err.includes('pipeline1'))).toHaveLength(0);
  });

  it('should validate multiple steps with different model configurations', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'step1',
            command: 'test-command',
            model: 'claude-opus-4-1-20250805', // Valid
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          },
          {
            name: 'step2',
            command: 'test-command',
            // No model - should be valid
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          },
          {
            name: 'step3',
            command: 'test-command',
            model: 'claude-haiku-3-5-invalid', // Invalid
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 3 ('step3'): Invalid model name \"claude-haiku-3-5-invalid\". Available models are: claude-opus-4-1-20250805, claude-opus-4-20250514, claude-sonnet-4-20250514, claude-3-7-sonnet-20250219, claude-3-5-haiku-20241022"
    );
    // Should not contain errors for the valid steps
    expect(result.errors.filter(err => err.includes('step1') || err.includes('step2'))).toHaveLength(0);
  });
});

describe('Validator - FileAccess Property Validation', () => {
  const mockProjectRoot = '/test/project';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock settings.json exists with basic permissions
    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) return true;
      if (pathStr.includes('package.json')) return true;
      if (pathStr.includes('commands')) return true; // Mock command files exist
      return false;
    });
    
    // Mock file reads
    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathLike, encoding: any) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) {
        return JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } });
      }
      if (pathStr.includes('package.json')) {
        return JSON.stringify({ scripts: { test: 'vitest' } });
      }
      if (pathStr.includes('commands')) {
        return '---\nallowed-tools: []\n---\nTest command content';
      }
      return '';
    });
  });

  it('should accept valid fileAccess with allowWrite array of strings', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {
              allowWrite: ['src/**/*', 'lib/**/*', '*.md']
            }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('fileAccess'));
  });

  it('should accept missing fileAccess property', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
            // No fileAccess property - should be valid
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('fileAccess'));
  });

  it('should accept empty fileAccess object', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {}
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(expect.stringContaining('fileAccess'));
  });

  it('should reject fileAccess as string', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: 'src/**/*' as any // Invalid string value
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'fileAccess' property must be an object."
    );
  });

  it('should reject fileAccess as array', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: ['src/**/*'] as any // Invalid array value
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'fileAccess' property must be an object."
    );
  });

  it('should reject fileAccess as null', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: null as any
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'fileAccess' property must be an object."
    );
  });

  it('should reject allowWrite as string instead of array', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {
              allowWrite: 'src/**/*' as any // Should be array
            }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'fileAccess.allowWrite' property must be an array of strings."
    );
  });

  it('should reject allowWrite as object', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {
              allowWrite: { pattern: 'src/**/*' } as any // Should be array
            }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'fileAccess.allowWrite' property must be an array of strings."
    );
  });

  it('should reject allowWrite array containing non-string values', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {
              allowWrite: ['src/**/*', 123, '*.md'] as any // Contains number
            }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'fileAccess.allowWrite' array contains an invalid value at index 1. All values must be non-empty strings."
    );
  });

  it('should reject allowWrite array containing empty strings', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {
              allowWrite: ['src/**/*', '', '*.md'] // Contains empty string
            }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'fileAccess.allowWrite' array contains an invalid value at index 1. All values must be non-empty strings."
    );
  });

  it('should reject allowWrite array containing null values', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {
              allowWrite: ['src/**/*', null, '*.md'] as any // Contains null
            }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'): The 'fileAccess.allowWrite' array contains an invalid value at index 1. All values must be non-empty strings."
    );
  });

  it('should handle multiple fileAccess validation errors', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'step1',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: 'invalid' as any // Should be object
          },
          {
            name: 'step2',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {
              allowWrite: ['src/**/*', 42] as any // Contains non-string
            }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('step1'): The 'fileAccess' property must be an object."
    );
    expect(result.errors).toContain(
      "Pipeline 'default', Step 2 ('step2'): The 'fileAccess.allowWrite' array contains an invalid value at index 1. All values must be non-empty strings."
    );
  });

  it('should handle fileAccess validation alongside other validation errors', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: '', // Missing name
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: 'invalid' as any, // Invalid retry
            fileAccess: {
              allowWrite: 'src/**/*' as any // Invalid allowWrite
            }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): is missing the 'name' property."
    );
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): The 'retry' property must be a non-negative integer, but found 'invalid'."
    );
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): The 'fileAccess.allowWrite' property must be an array of strings."
    );
  });

  it('should validate fileAccess in multiple pipelines', () => {
    const config = createBaseConfig({
      pipelines: {
        pipeline1: [
          {
            name: 'step1',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {
              allowWrite: ['src/**/*', 'lib/**/*']
            }
          }
        ],
        pipeline2: [
          {
            name: 'step2',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            fileAccess: {
              allowWrite: 'invalid' as any
            }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'pipeline2', Step 1 ('step2'): The 'fileAccess.allowWrite' property must be an array of strings."
    );
    // Should not contain errors for the valid pipeline1
    expect(result.errors.filter(err => err.includes('pipeline1'))).toHaveLength(0);
  });
});

describe('Validator - Array Check Validation', () => {
  const mockProjectRoot = '/test/project';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock settings.json exists with basic permissions
    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) return true;
      if (pathStr.includes('package.json')) return true;
      if (pathStr.includes('commands')) return true; // Mock command files exist
      return false;
    });
    
    // Mock file reads
    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathLike, encoding: any) => {
      if (filePath.includes('settings.json')) {
        return JSON.stringify({ permissions: { allow: ['Bash(npm test)', 'Bash(npx tsc --noEmit)'] } });
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

  it('should accept valid array of checks', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: [
              { type: 'shell', command: 'npx tsc --noEmit', expect: 'pass' },
              { type: 'shell', command: 'npm test', expect: 'fail' }
            ]
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept single check object (backward compatibility)', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate each check in array independently', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: [
              { type: 'fileExists', path: 'PLAN.md' },
              { type: 'shell', command: 'npm test', expect: 'pass' },
              { type: 'none' }
            ]
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid check type in array with proper indexing', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: [
              { type: 'shell', command: 'npm test', expect: 'pass' },
              { type: 'invalid-type' as any }
            ]
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'), check #2: Invalid check type 'invalid-type'. Available: none, fileExists, shell"
    );
  });

  it('should reject missing required properties in array checks with proper indexing', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: [
              { type: 'shell', command: 'npm test', expect: 'pass' },
              { type: 'fileExists' } as any, // Missing path
              { type: 'shell' } as any // Missing command
            ]
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'), check #2: Check type 'fileExists' requires a non-empty 'path' string property."
    );
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'), check #3: Check type 'shell' requires a non-empty 'command' string property."
    );
  });

  it('should reject invalid expect values in array checks with proper indexing', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: [
              { type: 'shell', command: 'npm test', expect: 'pass' },
              { type: 'shell', command: 'npm test', expect: 'invalid' as any }
            ]
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'), check #2: The 'expect' property for a shell check must be either \"pass\" or \"fail\"."
    );
  });

  it('should handle mixed valid and invalid checks in array', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: [
              { type: 'shell', command: 'npm test', expect: 'pass' }, // Valid
              { type: 'fileExists', path: '' }, // Invalid empty path
              { type: 'none' }, // Valid
              { type: 'shell', command: 'npm test', expect: 'invalid' as any } // Invalid expect
            ]
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'), check #2: Check type 'fileExists' requires a non-empty 'path' string property."
    );
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'), check #4: The 'expect' property for a shell check must be either \"pass\" or \"fail\"."
    );
    // Should have exactly 2 errors
    expect(result.errors.filter(err => err.includes('test-step'))).toHaveLength(2);
  });

  it('should validate npm script requirements for each check in array', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: [
              { type: 'shell', command: 'npm test', expect: 'pass' }, // Valid - script exists
              { type: 'shell', command: 'npm lint', expect: 'pass' } // Invalid - script doesn't exist
            ]
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'), check #2: The command \"npm lint\" requires a script named \"lint\" in your package.json, but it was not found."
    );
  });

  it('should handle empty array of checks', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: [] as any // Empty array
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    // This should be valid as we treat empty arrays the same as having no checks
    expect(result.isValid).toBe(true);
  });

  it('should handle checks with missing type in array', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: [
              { type: 'shell', command: 'npm test', expect: 'pass' },
              { path: 'PLAN.md' } as any // Missing type
            ]
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('test-step'), check #2: is missing a valid 'check' object with a 'type' property."
    );
  });

  it('should validate array checks across multiple pipeline steps', () => {
    const config = createBaseConfig({
      pipelines: {
        default: [
          {
            name: 'step1',
            command: 'test-command',
            check: [
              { type: 'shell', command: 'npm test', expect: 'pass' }
            ]
          },
          {
            name: 'step2',
            command: 'test-command',
            check: [
              { type: 'fileExists', path: '' } // Invalid
            ]
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Pipeline 'default', Step 2 ('step2'), check #1: Check type 'fileExists' requires a non-empty 'path' string property."
    );
    // Should not have errors for step1
    expect(result.errors.filter(err => err.includes('step1'))).toHaveLength(0);
  });
});

describe('Validator - Top-Level Config Validation', () => {
  const mockProjectRoot = '/test/project';
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock settings.json exists with basic permissions
    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) return true;
      if (pathStr.includes('package.json')) return true;
      if (pathStr.includes('commands')) return true; // Mock command files exist
      return false;
    });
    
    // Mock file reads
    vi.mocked(fs.readFileSync).mockImplementation((filePath: fs.PathLike, encoding: any) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('settings.json')) {
        return JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } });
      }
      if (pathStr.includes('package.json')) {
        return JSON.stringify({ scripts: { test: 'vitest' } });
      }
      if (pathStr.includes('commands')) {
        return '---\nallowed-tools: []\n---\nTest command content';
      }
      return '';
    });
  });

  it('should accept valid top-level config properties', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 'cat-herder-tasks',
      statePath: '.test-cat-herder/state',
      logsPath: '.test-cat-herder/logs',
      structureIgnore: ['node_modules/**', '.git/**'],
      manageGitBranch: true,
      defaultPipeline: 'default',
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors.filter(err => err.includes('Top-level config error'))).toHaveLength(0);
  });

  it('should accept config with undefined optional properties', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 'cat-herder-tasks',
      statePath: '.test-cat-herder/state', 
      logsPath: '.test-cat-herder/logs',
      structureIgnore: ['node_modules/**'],
      // manageGitBranch and defaultPipeline are undefined - should be valid
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors.filter(err => err.includes('Top-level config error'))).toHaveLength(0);
  });

  it('should reject invalid manageGitBranch (string instead of boolean)', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 'cat-herder-tasks',
      statePath: '.test-cat-herder/state',
      logsPath: '.test-cat-herder/logs', 
      structureIgnore: ['node_modules/**'],
      manageGitBranch: 'true' as any, // Invalid string value
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Top-level config error: 'manageGitBranch' must be a boolean (true or false)."
    );
  });

  it('should reject invalid taskFolder (number instead of string)', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 123 as any, // Invalid number value
      statePath: '.test-cat-herder/state',
      logsPath: '.test-cat-herder/logs',
      structureIgnore: ['node_modules/**'],
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Top-level config error: 'taskFolder' must be a string."
    );
  });

  it('should reject invalid statePath (object instead of string)', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 'cat-herder-tasks',
      statePath: { path: '.test-cat-herder/state' } as any, // Invalid object value
      logsPath: '.test-cat-herder/logs',
      structureIgnore: ['node_modules/**'],
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Top-level config error: 'statePath' must be a string."
    );
  });

  it('should reject invalid logsPath (array instead of string)', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 'cat-herder-tasks',
      statePath: '.test-cat-herder/state',
      logsPath: ['.test-cat-herder/logs'] as any, // Invalid array value
      structureIgnore: ['node_modules/**'],
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Top-level config error: 'logsPath' must be a string."
    );
  });

  it('should reject invalid structureIgnore (string instead of array)', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 'cat-herder-tasks',
      statePath: '.test-cat-herder/state',
      logsPath: '.test-cat-herder/logs',
      structureIgnore: 'node_modules/**' as any, // Invalid string value
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Top-level config error: 'structureIgnore' must be an array of strings."
    );
  });

  it('should reject invalid defaultPipeline (number instead of string)', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 'cat-herder-tasks',
      statePath: '.test-cat-herder/state',
      logsPath: '.test-cat-herder/logs',
      structureIgnore: ['node_modules/**'],
      defaultPipeline: 42 as any, // Invalid number value
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      "Top-level config error: 'defaultPipeline' must be a string."
    );
  });

  it('should handle multiple top-level config validation errors', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 123 as any, // Invalid number
      statePath: null as any, // Invalid null
      logsPath: '.test-cat-herder/logs',
      structureIgnore: 'node_modules/**' as any, // Invalid string
      manageGitBranch: 'yes' as any, // Invalid string
      defaultPipeline: [] as any, // Invalid array
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    
    expect(result.errors).toContain(
      "Top-level config error: 'taskFolder' must be a string."
    );
    expect(result.errors).toContain(
      "Top-level config error: 'statePath' must be a string."
    );
    expect(result.errors).toContain(
      "Top-level config error: 'structureIgnore' must be an array of strings."
    );
    expect(result.errors).toContain(
      "Top-level config error: 'manageGitBranch' must be a boolean (true or false)."
    );
    expect(result.errors).toContain(
      "Top-level config error: 'defaultPipeline' must be a string."
    );
  });

  it('should handle mix of top-level and pipeline validation errors', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 456 as any, // Invalid top-level
      statePath: '.test-cat-herder/state',
      logsPath: '.test-cat-herder/logs',
      structureIgnore: ['node_modules/**'],
      manageGitBranch: 'false' as any, // Invalid top-level
      pipelines: {
        default: [
          {
            name: '', // Invalid pipeline step
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' },
            retry: 'invalid' as any // Invalid pipeline step
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    
    // Check for top-level errors
    expect(result.errors).toContain(
      "Top-level config error: 'taskFolder' must be a string."
    );
    expect(result.errors).toContain(
      "Top-level config error: 'manageGitBranch' must be a boolean (true or false)."
    );
    
    // Check for pipeline errors
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): is missing the 'name' property."
    );
    expect(result.errors).toContain(
      "Pipeline 'default', Step 1 ('unnamed'): The 'retry' property must be a non-negative integer, but found 'invalid'."
    );
  });

  it('should accept manageGitBranch as false', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: 'cat-herder-tasks',
      statePath: '.test-cat-herder/state',
      logsPath: '.test-cat-herder/logs',
      structureIgnore: ['node_modules/**'],
      manageGitBranch: false, // Valid boolean value
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(true);
    expect(result.errors.filter(err => err.includes('manageGitBranch'))).toHaveLength(0);
  });

  it('should reject null values for required properties', () => {
    const config: ClaudeProjectConfig = {
      taskFolder: null as any, // Invalid null
      statePath: null as any, // Invalid null  
      logsPath: null as any, // Invalid null
      structureIgnore: null as any, // Invalid null
      pipelines: {
        default: [
          {
            name: 'test-step',
            command: 'test-command',
            check: { type: 'shell', command: 'npm test', expect: 'pass' }
          }
        ]
      }
    });

    const result = validatePipeline(config, mockProjectRoot);
    expect(result.isValid).toBe(false);
    
    expect(result.errors).toContain(
      "Top-level config error: 'taskFolder' must be a string."
    );
    expect(result.errors).toContain(
      "Top-level config error: 'statePath' must be a string."
    );
    expect(result.errors).toContain(
      "Top-level config error: 'logsPath' must be a string."
    );
    expect(result.errors).toContain(
      "Top-level config error: 'structureIgnore' must be an array of strings."
    );
  });
});