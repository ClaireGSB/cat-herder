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

describe('Validator - Check Object Validation', () => {
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

  describe('fileExists check validation', () => {
    it('should accept valid fileExists check with path', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'fileExists', path: 'PLAN.md' }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('fileExists'));
    });

    it('should reject fileExists check without path property', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'fileExists' } as any
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'fileExists' requires a non-empty 'path' string property."
      );
    });

    it('should reject fileExists check with empty path', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'fileExists', path: '' }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'fileExists' requires a non-empty 'path' string property."
      );
    });

    it('should reject fileExists check with non-string path', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'fileExists', path: 123 as any }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'fileExists' requires a non-empty 'path' string property."
      );
    });
  });

  describe('shell check validation', () => {
    it('should accept valid shell check with command and expect', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 'npm test', expect: 'pass' }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('shell'));
    });

    it('should accept valid shell check with command but no expect', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 'npm test' }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('shell'));
    });

    it('should reject shell check without command property', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell' } as any
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'shell' requires a non-empty 'command' string property."
      );
    });

    it('should reject shell check with empty command', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: '' }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'shell' requires a non-empty 'command' string property."
      );
    });

    it('should reject shell check with non-string command', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 42 as any }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): Check type 'shell' requires a non-empty 'command' string property."
      );
    });

    it('should reject shell check with invalid expect value', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 'npm test', expect: 'success' as any }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Pipeline 'default', Step 1 ('test-step'): The 'expect' property for a shell check must be either \"pass\" or \"fail\"."
      );
    });

    it('should accept shell check with expect "fail"', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'shell', command: 'npm test', expect: 'fail' }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('expect'));
    });
  });

  describe('none check validation', () => {
    it('should accept none check without additional properties', () => {
      const config: ClaudeProjectConfig = {
        pipelines: {
          default: [
            {
              name: 'test-step',
              command: 'test-command',
              check: { type: 'none' }
            }
          ]
        }
      };

      const result = validatePipeline(config, mockProjectRoot);
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(expect.stringContaining('none'));
    });
  });

  describe('multiple check validation errors', () => {
    it('should handle multiple check validation errors in same config', () => {
      const config: ClaudeProjectConfig = {
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
      };

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
      const config: ClaudeProjectConfig = {
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
      };

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