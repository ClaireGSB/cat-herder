import { StreamResult, RunStreamingOptions } from '../proc.js';

export interface AIProvider {
  runStreaming(
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
  ): Promise<StreamResult>;
}

