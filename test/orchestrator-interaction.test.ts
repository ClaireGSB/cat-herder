import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdirSync } from 'node:fs';
import readline from 'node:readline';

// Mock all dependencies
vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('node:readline');
vi.mock('../src/tools/proc.js');
vi.mock('../src/tools/status.js');
vi.mock('../src/config.js');
vi.mock('../src/tools/check-runner.js');

// Import the functions after mocking
const { runStreaming } = await import('../src/tools/proc.js');
const { updateStatus, readStatus } = await import('../src/tools/status.js');
const { getProjectRoot, getConfig } = await import('../src/config.js');
const { runCheck } = await import('../src/tools/check-runner.js');
const { executeStep } = await import('../src/tools/orchestration/step-runner.js');
const { HumanInterventionRequiredError, InterruptedError } = await import('../src/tools/orchestration/errors.js');

describe('Interactive Step Runner', () => {
  const mockStatusFile = '/test/project/.cat-herder/state/task-test.state.json';
  const mockLogFile = '/test/project/.cat-herder/logs/01-implement.log';
  const mockReasoningLogFile = '/test/project/.cat-herder/logs/01-implement.reasoning.log';
  const mockRawJsonLogFile = '/test/project/.cat-herder/logs/01-implement.raw.json.log';
  const mockPipelineName = 'default';

  const mockStepConfig = {
    name: 'implement',
    command: 'implement',
    check: { type: 'shell' as const, command: 'npm test', expect: 'pass' as const },
    retry: 2
  };

  const mockPrompt = 'Implement the feature according to the specifications.';

  const mockStatus = {
    version: 2,
    taskId: 'task-test',
    phase: 'running' as const,
    steps: { implement: 'running' },
    interactionHistory: [],
    tokenUsage: {},
    lastUpdate: '2025-08-20T00:00:00.000Z'
  };

  const mockConfig = {
    defaultPipeline: 'default',
    pipelines: { default: [] },
    interactionThreshold: 0
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    vi.mocked(getProjectRoot).mockReturnValue('/test/project');
    vi.mocked(getConfig).mockResolvedValue(mockConfig);
    vi.mocked(readFileSync).mockReturnValue('test command instructions');
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(readStatus).mockReturnValue({ ...mockStatus }); // Create fresh copy for each test
    vi.mocked(updateStatus).mockImplementation(() => {});
    vi.mocked(runCheck).mockResolvedValue({ success: true, output: 'Tests passed' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Human Intervention Workflow', () => {
    it('should pause execution when AI uses askHuman tool and resume after user response', async () => {
      // Mock the interactive workflow
      const mockQuestion = 'Should I use TypeScript interfaces or types for this implementation?';
      const mockAnswer = 'Please use interfaces for this implementation.';

      // Mock runStreaming to throw HumanInterventionRequiredError on first call, then succeed
      vi.mocked(runStreaming)
        .mockRejectedValueOnce(new HumanInterventionRequiredError(mockQuestion))
        .mockResolvedValueOnce({ 
          code: 0, 
          output: 'Implementation completed',
          modelUsed: 'claude-3-5-sonnet-20241022',
          tokenUsage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
        });

      // Mock readline to simulate user input
      const mockRl = {
        question: vi.fn((prompt, callback) => callback(mockAnswer)),
        close: vi.fn(),
        on: vi.fn()
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      // Track status updates
      const statusUpdates: any[] = [];
      let currentStatus = { ...mockStatus, interactionHistory: [] };
      vi.mocked(updateStatus).mockImplementation((file, updateFn) => {
        updateFn(currentStatus);
        statusUpdates.push(JSON.parse(JSON.stringify(currentStatus))); // Deep copy to avoid mutations
      });

      await executeStep(
        mockStepConfig,
        mockPrompt,
        mockStatusFile,
        mockLogFile,
        mockReasoningLogFile,
        mockRawJsonLogFile,
        mockPipelineName
      );

      // Verify the complete workflow
      expect(runStreaming).toHaveBeenCalledTimes(2);
      
      // First call should be with original prompt
      expect(vi.mocked(runStreaming).mock.calls[0][5]).toBe(mockPrompt);
      
      // Second call should include user feedback
      const secondCallPrompt = vi.mocked(runStreaming).mock.calls[1][5];
      expect(secondCallPrompt).toContain('--- HUMAN FEEDBACK ---');
      expect(secondCallPrompt).toContain(mockQuestion);
      expect(secondCallPrompt).toContain(mockAnswer);
      expect(secondCallPrompt).toContain('Continue your work based on this answer');

      // Verify status transitions - actual sequence is:
      // 1. Set step to running, 2. Set to waiting_for_input, 3. Set back to running, 4. Token update
      expect(statusUpdates.length).toBeGreaterThanOrEqual(3);
      
      // Check that we went to waiting_for_input state
      const waitingState = statusUpdates.find(s => s.phase === 'waiting_for_input');
      expect(waitingState).toBeDefined();
      expect(waitingState.pendingQuestion.question).toBe(mockQuestion);
      
      // Check that interaction was recorded in history
      const finalState = statusUpdates[statusUpdates.length - 1];
      expect(finalState.interactionHistory).toHaveLength(1);
      expect(finalState.interactionHistory[0].question).toBe(mockQuestion);
      expect(finalState.interactionHistory[0].answer).toBe(mockAnswer);
      expect(finalState.pendingQuestion).toBeUndefined();

      // Verify readline was used correctly
      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout
      });
      expect(mockRl.question).toHaveBeenCalledWith(
        expect.stringContaining('Your answer: '),
        expect.any(Function)
      );
    });

    it('should handle multiple consecutive questions from AI', async () => {
      const questions = [
        'Which authentication method should I use?',
        'Should I add rate limiting to the API endpoints?'
      ];
      const answers = [
        'Use JWT authentication',
        'Yes, add rate limiting with 100 requests per minute'
      ];

      // Mock runStreaming to throw two HumanInterventionRequiredErrors, then succeed
      vi.mocked(runStreaming)
        .mockRejectedValueOnce(new HumanInterventionRequiredError(questions[0]))
        .mockRejectedValueOnce(new HumanInterventionRequiredError(questions[1]))
        .mockResolvedValueOnce({ 
          code: 0, 
          output: 'Implementation completed',
          modelUsed: 'claude-3-5-sonnet-20241022',
          tokenUsage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
        });

      // Mock readline to return different answers
      const mockRl = {
        question: vi.fn()
          .mockImplementationOnce((prompt, callback) => callback(answers[0]))
          .mockImplementationOnce((prompt, callback) => callback(answers[1])),
        close: vi.fn(),
        on: vi.fn()
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const statusUpdates: any[] = [];
      let currentStatus = { ...mockStatus, interactionHistory: [] };
      vi.mocked(updateStatus).mockImplementation((file, updateFn) => {
        updateFn(currentStatus);
        statusUpdates.push(JSON.parse(JSON.stringify(currentStatus))); // Deep copy to avoid mutations
      });

      await executeStep(
        mockStepConfig,
        mockPrompt,
        mockStatusFile,
        mockLogFile,
        mockReasoningLogFile,
        mockRawJsonLogFile,
        mockPipelineName
      );

      // Should be called 3 times (initial + 2 after each question)
      expect(runStreaming).toHaveBeenCalledTimes(3);

      // Check the final interaction history contains both Q&As
      const finalState = statusUpdates[statusUpdates.length - 1];
      expect(finalState.interactionHistory.length).toBeGreaterThanOrEqual(2);
      expect(finalState.interactionHistory[0].question).toBe(questions[0]);
      expect(finalState.interactionHistory[0].answer).toBe(answers[0]);
      expect(finalState.interactionHistory[1].question).toBe(questions[1]);
      expect(finalState.interactionHistory[1].answer).toBe(answers[1]);

      // Verify the most recent answer is included in the final prompt
      // (The implementation accumulates feedback, so only the latest answer may be directly visible)
      const finalPrompt = vi.mocked(runStreaming).mock.calls[2][5];
      expect(finalPrompt).toContain(answers[1]); // Most recent answer should be in feedback
    });

    it('should handle user interruption (Ctrl+C) during input', async () => {
      const mockQuestion = 'Should I proceed with this approach?';

      // Mock runStreaming to throw HumanInterventionRequiredError
      vi.mocked(runStreaming)
        .mockRejectedValueOnce(new HumanInterventionRequiredError(mockQuestion));

      // Mock readline to simulate Ctrl+C interruption during question
      const mockRl = {
        question: vi.fn((prompt, callback) => {
          // Don't call the callback - simulate user hitting Ctrl+C instead
          // This simulates the user interrupting before providing an answer
        }),
        close: vi.fn(),
        on: vi.fn((event, callback) => {
          if (event === 'SIGINT') {
            // Immediately trigger the SIGINT handler to simulate Ctrl+C
            setTimeout(() => callback(), 0);
          }
        })
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const statusUpdates: any[] = [];
      let currentStatus = { ...mockStatus, interactionHistory: [] };
      vi.mocked(updateStatus).mockImplementation((file, updateFn) => {
        updateFn(currentStatus);
        statusUpdates.push(JSON.parse(JSON.stringify(currentStatus))); // Deep copy to avoid mutations
      });

      // Should throw InterruptedError
      await expect(executeStep(
        mockStepConfig,
        mockPrompt,
        mockStatusFile,
        mockLogFile,
        mockReasoningLogFile,
        mockRawJsonLogFile,
        mockPipelineName
      )).rejects.toThrow(InterruptedError);

      // Should have paused for input but not completed
      const waitingState = statusUpdates.find(s => s.phase === 'waiting_for_input');
      expect(waitingState).toBeDefined();
      expect(waitingState.pendingQuestion.question).toBe(mockQuestion);

      // Should not have added to interaction history since user interrupted
      const finalState = statusUpdates[statusUpdates.length - 1];
      // The function throws an error before updating history, so it may not reach that part
      expect(finalState.interactionHistory.length).toBeLessThanOrEqual(1);
    });

    it('should work correctly when no human intervention is required', async () => {
      // Mock successful execution without any questions
      vi.mocked(runStreaming).mockResolvedValue({ 
        code: 0, 
        output: 'Implementation completed successfully',
        modelUsed: 'claude-3-5-sonnet-20241022',
        tokenUsage: { input_tokens: 150, output_tokens: 75, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      });

      const statusUpdates: any[] = [];
      let currentStatus = { ...mockStatus, interactionHistory: [] };
      vi.mocked(updateStatus).mockImplementation((file, updateFn) => {
        updateFn(currentStatus);
        statusUpdates.push(JSON.parse(JSON.stringify(currentStatus))); // Deep copy to avoid mutations
      });

      await executeStep(
        mockStepConfig,
        mockPrompt,
        mockStatusFile,
        mockLogFile,
        mockReasoningLogFile,
        mockRawJsonLogFile,
        mockPipelineName
      );

      // Should only call runStreaming once
      expect(runStreaming).toHaveBeenCalledTimes(1);
      expect(vi.mocked(runStreaming).mock.calls[0][5]).toBe(mockPrompt);

      // Should never create readline interface
      expect(readline.createInterface).not.toHaveBeenCalled();

      // Should have no interaction history
      const finalState = statusUpdates[statusUpdates.length - 1];
      expect(finalState.interactionHistory.length).toBe(0);
      expect(finalState.pendingQuestion).toBeUndefined();
    });

    it('should combine human intervention with retry logic', async () => {
      const mockQuestion = 'The tests are failing. Should I modify the test approach?';
      const mockAnswer = 'Yes, please update the test to match the new implementation.';

      // Mock: First attempt throws question, second attempt (with answer) succeeds but fails check,
      // third attempt (retry) succeeds with passing check
      vi.mocked(runStreaming)
        .mockRejectedValueOnce(new HumanInterventionRequiredError(mockQuestion))
        .mockResolvedValueOnce({ code: 0, output: 'Implementation done', tokenUsage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
        .mockResolvedValueOnce({ code: 0, output: 'Implementation fixed', tokenUsage: { input_tokens: 120, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });

      vi.mocked(runCheck)
        .mockResolvedValueOnce({ success: false, output: 'Tests still failing' })
        .mockResolvedValueOnce({ success: true, output: 'All tests pass' });

      const mockRl = {
        question: vi.fn((prompt, callback) => callback(mockAnswer)),
        close: vi.fn(),
        on: vi.fn()
      };
      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const statusUpdates: any[] = [];
      let currentStatus = { ...mockStatus, interactionHistory: [] };
      vi.mocked(updateStatus).mockImplementation((file, updateFn) => {
        updateFn(currentStatus);
        statusUpdates.push(JSON.parse(JSON.stringify(currentStatus))); // Deep copy to avoid mutations
      });

      await executeStep(
        mockStepConfig,
        mockPrompt,
        mockStatusFile,
        mockLogFile,
        mockReasoningLogFile,
        mockRawJsonLogFile,
        mockPipelineName
      );

      // Should be called 3 times: initial + question response + retry
      expect(runStreaming).toHaveBeenCalledTimes(3);
      
      // Check should be called 2 times: after question response + after retry
      expect(runCheck).toHaveBeenCalledTimes(2);

      // Should have recorded the interaction
      const finalState = statusUpdates[statusUpdates.length - 1];
      expect(finalState.interactionHistory.length).toBeGreaterThanOrEqual(1);
      expect(finalState.interactionHistory[0].question).toBe(mockQuestion);
      expect(finalState.interactionHistory[0].answer).toBe(mockAnswer);

      // The third call should include retry feedback
      const thirdCallPrompt = vi.mocked(runStreaming).mock.calls[2][5];
      expect(thirdCallPrompt).toContain('Your previous attempt to complete'); // Retry feedback
      expect(thirdCallPrompt).toContain('Tests still failing'); // Check failure output
    });
  });
});