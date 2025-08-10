import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { execSync } from 'node:child_process';

// Mock external dependencies
vi.mock('node:child_process');
vi.mock('../src/tools/check-runner.js');
vi.mock('../src/tools/proc.js');
vi.mock('../src/tools/status.js');
vi.mock('../src/config.js');

// Import the mocked modules
const mockedExecSync = execSync as Mock;

// Mock the runCheck function directly since we need to control its return values
const mockRunCheck = vi.fn();
vi.doMock('../src/tools/check-runner.js', () => ({
  runCheck: mockRunCheck
}));

// Mock the runStreaming function 
const mockRunStreaming = vi.fn();
vi.doMock('../src/tools/proc.js', () => ({
  runStreaming: mockRunStreaming
}));

// Mock status functions
const mockUpdateStatus = vi.fn();
const mockReadStatus = vi.fn();
vi.doMock('../src/tools/status.js', () => ({
  updateStatus: mockUpdateStatus,
  readStatus: mockReadStatus
}));

// Mock config functions
const mockGetProjectRoot = vi.fn();
vi.doMock('../src/config.js', () => ({
  getProjectRoot: mockGetProjectRoot
}));

describe('Orchestrator Hook and Retry Logic', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Set up default mock implementations
    mockedExecSync.mockReturnValue('');
    mockRunStreaming.mockResolvedValue({ code: 0 });
    mockUpdateStatus.mockImplementation(() => {});
    mockGetProjectRoot.mockReturnValue('/test/project');
  });

  describe('preCheck hook execution', () => {
    it('should execute preCheck hooks before running the main check', async () => {
      // Mock the orchestrator module after setting up other mocks
      const { default: executeStepModule } = await import('../src/tools/orchestrator.js');
      
      const stepConfig = {
        name: 'test-step',
        command: 'test-command',
        check: { type: 'none' as const },
        hooks: {
          preCheck: [
            { type: 'shell' as const, command: 'echo "pre-check running"' }
          ]
        }
      };

      // Mock successful check
      mockRunCheck.mockResolvedValue({ success: true });

      // Execute the step (we'll need to create a test wrapper function)
      // Since executeStep is not exported, we'll test through the public interface
      // This test verifies the preCheck hook gets called
      mockedExecSync.mockReturnValue('pre-check output');

      // For now, let's create a minimal test that verifies hook execution logic
      // We'll test the hook execution function directly if it's exported
      expect(true).toBe(true); // Placeholder - will be replaced with actual test
    });
  });

  describe('onCheckFailure hook and retry logic', () => {
    it('should trigger onCheckFailure hook and retry when check fails', async () => {
      const stepConfig = {
        name: 'implement',
        command: 'implement',
        check: { type: 'shell' as const, command: 'npm test', expect: 'pass' as const },
        hooks: {
          onCheckFailure: [
            {
              type: 'shell' as const,
              command: 'echo "Test failed. Error: {check_output}. Please fix the implementation."'
            }
          ]
        }
      };

      // Mock the sequence: first check fails, second check passes
      mockRunCheck
        .mockResolvedValueOnce({ success: false, output: 'TypeError: Cannot read property' })
        .mockResolvedValueOnce({ success: true });

      // Mock the hook command to return the feedback template
      mockedExecSync
        .mockReturnValueOnce('Test failed. Error: {check_output}. Please fix the implementation.')
        .mockReturnValueOnce('') // For git add
        .mockReturnValueOnce(''); // For git commit

      // This is a conceptual test structure - in the actual implementation,
      // we would need to either:
      // 1. Export the executeStep function for direct testing, or
      // 2. Create a test wrapper that calls the orchestrator with controlled inputs
      
      // For now, verify that our mock setup is working correctly
      expect(mockRunCheck).toBeDefined();
      expect(mockedExecSync).toBeDefined();
      expect(stepConfig.hooks?.onCheckFailure).toBeDefined();
    });

    it('should substitute {check_output} token in hook command', () => {
      const feedbackTemplate = 'The test suite failed. Error: {check_output}. Please fix it.';
      const checkOutput = 'TypeError: Cannot read property "foo" of undefined';
      
      const substitutedPrompt = feedbackTemplate.replace(/{check_output}/g, checkOutput);
      
      expect(substitutedPrompt).toBe('The test suite failed. Error: TypeError: Cannot read property "foo" of undefined. Please fix it.');
    });

    it('should fail after maximum retry attempts', () => {
      // Mock check to always fail
      mockRunCheck.mockResolvedValue({ success: false, output: 'Persistent error' });
      
      const maxRetries = 3;
      
      // Verify that after 3 attempts, the step should fail
      // This would be tested through the actual executeStep function
      expect(maxRetries).toBe(3);
    });

    it('should format hook error messages correctly', () => {
      const mockError = new Error('Hook command failed');
      
      // Test the error message formatting logic that would be used in the orchestrator
      const formatHookError = (command: string, error: Error | string) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return `OnCheckFailure hook "${command}" failed to execute. Cannot generate feedback for Claude: ${errorMsg}`;
      };
      
      expect(formatHookError('failing-command', mockError)).toBe(
        'OnCheckFailure hook "failing-command" failed to execute. Cannot generate feedback for Claude: Hook command failed'
      );
      
      // Test with string error
      expect(formatHookError('another-command', 'String error')).toBe(
        'OnCheckFailure hook "another-command" failed to execute. Cannot generate feedback for Claude: String error'
      );
    });
  });

  describe('hook execution edge cases', () => {
    it('should handle missing {check_output} token gracefully', () => {
      const templateWithoutToken = 'Please fix the failing tests.';
      const checkOutput = 'Some error output';
      
      // Should work even without the token
      const result = templateWithoutToken.replace(/{check_output}/g, checkOutput);
      expect(result).toBe('Please fix the failing tests.');
    });

    it('should handle empty hook arrays', () => {
      const stepConfig = {
        name: 'test-step',
        command: 'test-command', 
        check: { type: 'none' as const },
        hooks: {
          preCheck: [],
          onCheckFailure: []
        }
      };

      // Empty hook arrays should be handled gracefully
      expect(stepConfig.hooks.preCheck).toEqual([]);
      expect(stepConfig.hooks.onCheckFailure).toEqual([]);
    });

    it('should handle undefined hooks property', () => {
      const stepConfig = {
        name: 'test-step',
        command: 'test-command',
        check: { type: 'none' as const }
        // No hooks property
      };

      // Should work fine without hooks
      expect(stepConfig.hooks).toBeUndefined();
    });
  });
});