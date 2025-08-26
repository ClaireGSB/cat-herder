import { spawn, ChildProcess } from "node:child_process";
import { mkdirSync, createWriteStream, WriteStream, readFileSync } from "node:fs";
import { dirname } from "node:path";
import pc from "picocolors";
import { HumanInterventionRequiredError } from "./orchestration/errors.js";

let activeProcess: ChildProcess | null = null;
let wasKilled = false;

// Interface for token usage data from Claude CLI stream
interface StepTokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export function killActiveProcess() {
  if (activeProcess) {
    console.log(pc.yellow("[Proc] Interruption signal received. Terminating active Claude process..."));
    wasKilled = true; 
    activeProcess.kill('SIGINT');
    activeProcess = null;
  }
}

export interface StreamResult {
  code: number;
  output: string;
  modelUsed?: string;
  tokenUsage?: StepTokenUsage;
  rateLimit?: {
    resetTimestamp: number;
  };
}

export interface RunStreamingOptions {
  pipelineName?: string;
  settings?: any;
}

export function runStreaming(
  cmd: string,
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
  wasKilled = false;
  // Build final args with JSON streaming flags and enhanced debugging
  const finalArgs = [...args, "--output-format", "stream-json", "--verbose"];
  

  // Conditionally add the model flag
  if (model) {
    finalArgs.push("--model", model);
  }

  console.log(`[Proc] Spawning: ${cmd} ${finalArgs.join(" ")}`);
  console.log(`[Proc] Logging to: ${logPath}`);
  console.log(`[Proc] Logging reasoning to: ${reasoningLogPath}`);
  if (rawJsonLogPath) {
    console.log(`[Proc] Logging raw JSON to: ${rawJsonLogPath}`);
  }

  // --- THIS IS THE NEWLY ADDED SECTION FOR CLI LOGGING ---
  // Log the prompt context being sent to stdin directly to the console.
  if (stdinData) {
    console.log(pc.gray("\n--- Sending Prompt Context to Claude ---"));
    // Use a dim color so it's readable but distinct from the AI's output
    console.log(pc.dim(stdinData.trim()));
    console.log(pc.gray("----------------------------------------\n"));
  }
  // --- END OF NEW SECTION ---


  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "a" });
  
  // Create reasoning log stream - now required
  mkdirSync(dirname(reasoningLogPath), { recursive: true });
  const reasoningStream = createWriteStream(reasoningLogPath, { flags: "a" });

  // Create raw JSON log stream if path is provided
  let rawJsonStream: WriteStream | undefined;
  if (rawJsonLogPath) {
    mkdirSync(dirname(rawJsonLogPath), { recursive: true });
    rawJsonStream = createWriteStream(rawJsonLogPath, { flags: 'a' });
  }

  // Write detailed headers to the log files for later debugging
  // --- Add a distinct header for each attempt to make logs readable ---
  const startTime = new Date();
  const headerInfo = `
=================================================
  New Attempt Started at: ${startTime.toISOString()}
  Command: ${cmd} ${finalArgs.join(" ")}
  Pipeline: ${options?.pipelineName || 'N/A'}
  Model: ${model || 'default'}
  Settings: ${options?.settings ? JSON.stringify(options.settings, null, 2) : 'N/A'}
=================================================
`;

  logStream.write(headerInfo);
  reasoningStream.write(headerInfo);
  reasoningStream.write(`--- This file contains Claude's step-by-step reasoning process ---\n`);

  logStream.write(`\n--- PROMPT DATA ---\n`);
  logStream.write(stdinData || "");
  logStream.write(`--- END PROMPT DATA ---\n\n`);
  logStream.write(`-------------------------------------------------\n\n`);

  let fullOutput = "";
  let buffer = ""; // Buffer for parsing JSON lines across chunks
  let detectedModelName: string | undefined;
  let stepTokenUsage: StepTokenUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  let rateLimitInfo: StreamResult['rateLimit'] | undefined;
  let lastToolUsed: string | null = null;

  return new Promise((resolve) => {
    const p = spawn(cmd, finalArgs, {
      shell: false,
      stdio: "pipe",
      cwd: cwd,
      env: {
        ...process.env,
        CAT_HERDER_ACTIVE: "true",
        ...(taskId && { CLAUDE_TASK_ID: taskId }),
      },
    });
    activeProcess = p;
    const spawnTimestamp = new Date().toISOString();
    // Write stdin data if provided
    if (stdinData) {
      p.stdin.write(stdinData);
      p.stdin.end();
      reasoningStream.write(`[${spawnTimestamp}] [PROCESS-DEBUG] Stdin data written and closed\n\n`);
    }

    p.stdout.on("data", (chunk) => {
      const chunkStr = chunk.toString();
      buffer += chunkStr;

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim() === '') continue;

        // Write raw line to JSON stream with embedded timestamp
        if (rawJsonStream) {
          const timestamp = new Date().toISOString();
          try {
            const eventData = JSON.parse(line);
            // Create a new object with timestamp first, then spread the original data
            const logEntry = {
              timestamp: timestamp,
              ...eventData
            };
            rawJsonStream.write(JSON.stringify(logEntry) + '\n');
          } catch (e) {
            // If a line is not valid JSON, log it as an error object with timestamp first
            const errorPayload = {
              timestamp: timestamp,
              error: "Log event was not valid JSON",
              originalLine: line
            };
            rawJsonStream.write(JSON.stringify(errorPayload) + '\n');
          }
        }

        try {
          const json = JSON.parse(line);

          if (!detectedModelName && (json.model || json.message?.model)) {
            detectedModelName = json.model || json.message.model;
          }
          
          // Capture token usage data if present in the message
          if (json.message?.usage) {
            const usage = json.message.usage;
            stepTokenUsage.input_tokens += usage.input_tokens || 0;
            stepTokenUsage.output_tokens += usage.output_tokens || 0;
            stepTokenUsage.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
            stepTokenUsage.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
          }
          
          const contentItem = json.message?.content?.[0];

          // 1. Filter unwanted system messages
          // actually keep them for now
          // if ((json.type === 'system' && json.subtype === 'init') || 
          //     (contentItem?.text && contentItem.text.includes('malicious'))) {
          //   continue; // Skip writing this line to the reasoning log
          // }

          // 2. Capture the tool name when it's used
          if (contentItem?.type === 'tool_use') {
            lastToolUsed = contentItem.name;
            
            // Detect askHuman tool usage and throw error to pause execution
            if (contentItem.name === 'askHuman') {
              const question = contentItem.input?.question;
              if (typeof question === 'string') {
                throw new HumanInterventionRequiredError(question);
              }
            }
          }

          // 3. Summarize tool results before logging
          if (contentItem?.type === 'tool_result' && typeof contentItem.content === 'string') {
            const originalContent = contentItem.content;

            switch (lastToolUsed) {
              case 'Read':
                const lineCount = originalContent.split('\n').length;
                contentItem.content = `Read file content (${lineCount} lines).`;
                break;
              case 'Glob':
                const fileCount = originalContent.trim().split('\n').filter(Boolean).length;
                contentItem.content = `Glob found ${fileCount} file(s).`;
                break;
              case 'Bash':
                if (originalContent.includes('Test Files') && originalContent.includes('Tests')) {
                  const failMatch = originalContent.match(/(\d+) failed/);
                  const passMatch = originalContent.match(/(\d+) passed/);
                  let testResult = [];
                  if (failMatch) testResult.push(`${failMatch[1]} failed`);
                  if (passMatch) testResult.push(`${passMatch[1]} passed`);
                  contentItem.content = `Test suite finished. Result: ${testResult.join(', ')}.`;
                } else if (originalContent.length > 500) {
                  contentItem.content = `Bash command finished. Output truncated for brevity.`;
                }
                break;
              case 'LS':
                const itemCount = originalContent.split('\n').filter(Boolean).length;
                contentItem.content = `Listed ${itemCount} items in directory.`;
                break;
              case 'Grep':
                if (originalContent.trim() === '') {
                  contentItem.content = `No matches found.`;
                } else {
                  const matchCount = originalContent.split('\n').filter(Boolean).length;
                  contentItem.content = `Found ${matchCount} matches.`;
                }
                break;
            }
            // Reset state for the next tool call
            lastToolUsed = null; 
          }

          // Log entries to reasoning log with existing logic
          const timestamp = new Date().toISOString().replace('T', ' ').slice(0, -5);
          const contentType = contentItem?.type || json.subtype || 'data';

          let content;
          if (contentItem?.type === 'tool_use') {
            // For tool use, show just tool name and input
            content = `${contentItem.name}(${JSON.stringify(contentItem.input)})`;
          } else {
            // For other content, use existing logic
            content = contentItem?.text || contentItem?.content || json.result || JSON.stringify(json, null, 2);
          }

          reasoningStream.write(`[${timestamp}] [${json.type.toUpperCase()}] [${contentType.toUpperCase()}] ${content}\n`);

          // Special case: also output "result" to CLI with [CLAUDE] prefix
          if (json.type === "result") {
            const resultText = json.result;
            if (resultText) {
              // Check for rate limit error before processing as normal output
              if (typeof resultText === 'string' && resultText.startsWith("Claude AI usage limit reached|")) {
                const parts = resultText.split('|');
                const timestamp = parseInt(parts[1], 10);
                if (!isNaN(timestamp)) {
                  rateLimitInfo = { resetTimestamp: timestamp };
                }
              }

              process.stdout.write(`[CLAUDE] ${resultText}`);
              logStream.write(resultText);
              fullOutput += resultText;
            }
          }
        } catch (e) {
          // If JSON parsing fails, treat as regular output
          process.stdout.write(line + "\n");
          logStream.write(line + "\n");
          fullOutput += line + "\n";
        }
      }
    });

    p.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      logStream.write(chunk);

      // Write stderr to reasoning log with enhanced debugging
      if (reasoningStream) {
        const timestamp = new Date().toISOString();
        reasoningStream.write(`[${timestamp}] [STDERR] Received ${chunk.toString().length} bytes\n`);
        reasoningStream.write(`[${timestamp}] [STDERR] Content: ${chunk.toString()}`);
      }

      fullOutput += chunk.toString();
    });

    p.on("close", (code, signal) => {
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;

      const tokenFooter = `\n--- Token Usage ---\n` +
                          `Input Tokens: ${stepTokenUsage.input_tokens}\n` +
                          `Output Tokens: ${stepTokenUsage.output_tokens}\n` +
                          `Cache Creation Input Tokens: ${stepTokenUsage.cache_creation_input_tokens}\n` +
                          `Cache Read Input Tokens: ${stepTokenUsage.cache_read_input_tokens}\n`;

      const footer = `\n\n-------------------------------------------------\n`;
      const footer2 = `--- Process finished at: ${endTime.toISOString()} ---\n`;
      const footer3 = `--- Duration: ${duration.toFixed(2)}s, Exit Code: ${code} ---\n`;

      
      // Conditionally create the finish reason based on interruption status
      let finishReason: string;
      if (wasKilled || signal === 'SIGINT') {
        finishReason = `--- Reason: Interrupted by user, Exit Signal: ${signal || 'SIGINT'} ---\n`;
      } else {
        finishReason = `--- Reason: Process completed normally, Exit Code: ${code} ---\n`;
      }

      const fullFooter = footer + footer2 + finishReason + footer3 + tokenFooter;

      const streams: WriteStream[] = [logStream, reasoningStream];
      if(rawJsonStream) streams.push(rawJsonStream);

      logStream.write(fullFooter);
      logStream.end();
      
      reasoningStream.write(fullFooter);
      reasoningStream.end();
      
      if (rawJsonStream) {
        rawJsonStream.write(fullFooter);
        rawJsonStream.end();
      }

      activeProcess = null;
      resolve({ code: code ?? 1, output: fullOutput, modelUsed: detectedModelName, tokenUsage: stepTokenUsage, rateLimit: rateLimitInfo });
    });
  });
}
