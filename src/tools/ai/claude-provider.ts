import { AIProvider } from './ai-provider.js';
import { RunStreamingOptions, StreamResult, runStreaming as runClaudeStreaming } from '../proc.js';

/**
 * Thin wrapper around the existing Claude streaming implementation to conform
 * to the AIProvider interface. This preserves current behavior.
 */
export class ClaudeProvider implements AIProvider {
  async runStreaming(
    command: string,
    args: string[],
    logPath: string,
    reasoningLogPath: string,
    cwd: string,
    stdinData?: string,
    rawJsonLogPath?: string,
    model?: string,
    options?: RunStreamingOptions,
    taskId?: string
  ): Promise<StreamResult> {
    // Force using the Claude CLI while preserving incoming args
    const cmd = 'claude';
    // The existing implementation expects commands like `/project:<command>`
    return await runClaudeStreaming(
      cmd,
      args,
      logPath,
      reasoningLogPath,
      cwd,
      stdinData,
      rawJsonLogPath,
      model,
      options,
      taskId
    );
  }
}

