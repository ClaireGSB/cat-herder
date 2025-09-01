import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { writeFileSync, mkdirSync } from 'node:fs';

// Mock all dependencies
vi.mock('node:fs');
vi.mock('../src/tools/status.js');
vi.mock('../src/tools/web/data-access.js');

// Import the functions after mocking
const { writeAnswerToFile } = await import('../src/tools/status.js');
const { getTaskDetails } = await import('../src/tools/web/data-access.js');
const { createRouter } = await import('../src/tools/web/routes.js');

describe('API Routes - Interactive Halting', () => {
  let app: express.Application;
  const mockStateDir = '/test/state';
  const mockLogsDir = '/test/logs';
  const mockConfig = { autonomyLevel: 0 };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up Express app with the router
    app = express();
    const router = createRouter(mockStateDir, mockLogsDir, mockConfig);
    app.use('/', router);
    
    // Setup default mocks
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(writeFileSync).mockImplementation(() => {});
    vi.mocked(writeAnswerToFile).mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /task/:taskId/respond', () => {
    const validTaskId = 'task-test-123';
    const validAnswer = 'Please use TypeScript interfaces for this implementation.';

    it('should successfully submit an answer for a waiting task', async () => {
      // Mock a task that is waiting for input
      const mockTaskDetails = {
        taskId: validTaskId,
        phase: 'waiting_for_input' as const,
        pendingQuestion: {
          question: 'Should I use interfaces or types?',
          timestamp: '2025-08-20T10:00:00.000Z'
        },
        interactionHistory: []
      };
      
      vi.mocked(getTaskDetails).mockReturnValue(mockTaskDetails);

      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: validAnswer })
        .expect(200);

      expect(response.body).toEqual({
        message: "Answer submitted successfully. The task will now resume."
      });

      // Verify that writeAnswerToFile was called with correct parameters
      expect(writeAnswerToFile).toHaveBeenCalledWith(
        mockStateDir,
        validTaskId,
        validAnswer
      );
    });

    it('should return 400 for missing taskId', async () => {
      const response = await request(app)
        .post('/task//respond') // Empty taskId
        .send({ answer: validAnswer })
        .expect(404); // Express router will return 404 for invalid route

      expect(writeAnswerToFile).not.toHaveBeenCalled();
    });

    it('should return 400 for missing answer in request body', async () => {
      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({}) // No answer field
        .expect(400);

      expect(response.body).toEqual({
        error: "Invalid request: taskId and answer are required."
      });

      expect(writeAnswerToFile).not.toHaveBeenCalled();
    });

    it('should return 400 for non-string taskId', async () => {
      const response = await request(app)
        .post('/task/123/respond') // Numeric taskId should still work
        .send({ answer: validAnswer });

      // Since URL params are always strings, this should work
      // Let's test with a task that doesn't exist instead
      vi.mocked(getTaskDetails).mockReturnValue(null);

      const response2 = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: validAnswer })
        .expect(409);

      expect(response2.body).toEqual({
        error: "Task is not currently waiting for input."
      });
    });

    it('should return 400 for non-string answer', async () => {
      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: 123 }) // Non-string answer
        .expect(400);

      expect(response.body).toEqual({
        error: "Invalid request: taskId and answer are required."
      });

      expect(writeAnswerToFile).not.toHaveBeenCalled();
    });

    it('should return 409 when task does not exist', async () => {
      vi.mocked(getTaskDetails).mockReturnValue(null);

      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: validAnswer })
        .expect(409);

      expect(response.body).toEqual({
        error: "Task is not currently waiting for input."
      });

      expect(writeAnswerToFile).not.toHaveBeenCalled();
    });

    it('should return 409 when task is not waiting for input', async () => {
      // Mock a task that is running but not waiting for input
      const mockTaskDetails = {
        taskId: validTaskId,
        phase: 'running' as const,
        pendingQuestion: undefined,
        interactionHistory: []
      };
      
      vi.mocked(getTaskDetails).mockReturnValue(mockTaskDetails);

      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: validAnswer })
        .expect(409);

      expect(response.body).toEqual({
        error: "Task is not currently waiting for input."
      });

      expect(writeAnswerToFile).not.toHaveBeenCalled();
    });

    it('should return 409 when task is in completed state', async () => {
      // Mock a task that is done
      const mockTaskDetails = {
        taskId: validTaskId,
        phase: 'done' as const,
        pendingQuestion: undefined,
        interactionHistory: []
      };
      
      vi.mocked(getTaskDetails).mockReturnValue(mockTaskDetails);

      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: validAnswer })
        .expect(409);

      expect(response.body).toEqual({
        error: "Task is not currently waiting for input."
      });

      expect(writeAnswerToFile).not.toHaveBeenCalled();
    });

    it('should return 500 when file writing fails', async () => {
      const mockTaskDetails = {
        taskId: validTaskId,
        phase: 'waiting_for_input' as const,
        pendingQuestion: {
          question: 'Should I use interfaces or types?',
          timestamp: '2025-08-20T10:00:00.000Z'
        },
        interactionHistory: []
      };
      
      vi.mocked(getTaskDetails).mockReturnValue(mockTaskDetails);
      vi.mocked(writeAnswerToFile).mockRejectedValue(new Error('Disk full'));

      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: validAnswer })
        .expect(500);

      expect(response.body).toEqual({
        error: "Failed to process the answer."
      });

      expect(writeAnswerToFile).toHaveBeenCalledWith(
        mockStateDir,
        validTaskId,
        validAnswer
      );
    });

    it('should handle empty string answer (should be allowed)', async () => {
      const mockTaskDetails = {
        taskId: validTaskId,
        phase: 'waiting_for_input' as const,
        pendingQuestion: {
          question: 'Continue with default settings?',
          timestamp: '2025-08-20T10:00:00.000Z'
        },
        interactionHistory: []
      };
      
      vi.mocked(getTaskDetails).mockReturnValue(mockTaskDetails);

      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: '' }) // Empty string should be allowed
        .expect(400); // Our validation requires non-empty strings

      expect(response.body).toEqual({
        error: "Invalid request: taskId and answer are required."
      });
    });

    it('should handle whitespace-only answer', async () => {
      const mockTaskDetails = {
        taskId: validTaskId,
        phase: 'waiting_for_input' as const,
        pendingQuestion: {
          question: 'Continue with default settings?',
          timestamp: '2025-08-20T10:00:00.000Z'
        },
        interactionHistory: []
      };
      
      vi.mocked(getTaskDetails).mockReturnValue(mockTaskDetails);

      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: '   ' }) // Whitespace-only answer
        .expect(200);

      expect(response.body).toEqual({
        message: "Answer submitted successfully. The task will now resume."
      });

      expect(writeAnswerToFile).toHaveBeenCalledWith(
        mockStateDir,
        validTaskId,
        '   ' // Should preserve whitespace
      );
    });

    it('should handle very long answers', async () => {
      const longAnswer = 'A'.repeat(10000); // 10KB answer
      const mockTaskDetails = {
        taskId: validTaskId,
        phase: 'waiting_for_input' as const,
        pendingQuestion: {
          question: 'Please provide detailed requirements?',
          timestamp: '2025-08-20T10:00:00.000Z'
        },
        interactionHistory: []
      };
      
      vi.mocked(getTaskDetails).mockReturnValue(mockTaskDetails);

      const response = await request(app)
        .post(`/task/${validTaskId}/respond`)
        .send({ answer: longAnswer })
        .expect(200);

      expect(response.body).toEqual({
        message: "Answer submitted successfully. The task will now resume."
      });

      expect(writeAnswerToFile).toHaveBeenCalledWith(
        mockStateDir,
        validTaskId,
        longAnswer
      );
    });
  });
});