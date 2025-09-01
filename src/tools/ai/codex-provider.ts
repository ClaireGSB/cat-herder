import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AIProvider } from './ai-provider.js';
import type { RunStreamingOptions, StreamResult } from '../proc.js';

/**
 * CodexProvider: Executes `codex exec` and, after completion, parses the
 * latest JSONL session log from ~/.codex/sessions to assemble output and
 * reasoning logs. This is a best-effort parser to fit our StreamResult.
 */
export class CodexProvider implements AIProvider {
  async runStreaming(
    _command: string,
    _args: string[],
    logPath: string,
    reasoningLogPath: string,
    cwd: string,
    stdinData?: string,
    rawJsonLogPath?: string,
    model?: string,
    options?: RunStreamingOptions,
    _taskId?: string
  ): Promise<StreamResult> {
    // Ensure log directories exist
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.mkdirSync(path.dirname(reasoningLogPath), { recursive: true });
    if (rawJsonLogPath) fs.mkdirSync(path.dirname(rawJsonLogPath), { recursive: true });

    const start = new Date();
    const header = `\n=================================================\n  Codex Run Started at: ${start.toISOString()}\n  Command: codex exec\n  Model: ${model || 'default'}\n  CWD: ${cwd}\n=================================================\n`;
    fs.appendFileSync(logPath, header);
    fs.appendFileSync(reasoningLogPath, header + `--- This file contains Codex reasoning (assembled post-run) ---\n`);
    if (stdinData) {
      fs.appendFileSync(logPath, `\n--- PROMPT DATA ---\n${stdinData}\n--- END PROMPT DATA ---\n\n`);
    }

    // Spawn the codex CLI. We assume the CLI handles auth and writes logs to ~/.codex/sessions
    const args: string[] = ['exec'];
    if (model) args.push('--model', model);

    const code = await new Promise<number>((resolve) => {
      const p = spawn('codex', args, { cwd, stdio: 'pipe', shell: false });
      if (stdinData) {
        p.stdin.write(stdinData);
        p.stdin.end();
      }
      // Codex writes to its own logs; still capture stderr to our reasoning log for debugging
      p.stderr.on('data', (chunk) => {
        const ts = new Date().toISOString();
        fs.appendFileSync(reasoningLogPath, `[${ts}] [STDERR] ${chunk.toString()}\n`);
      });
      p.stdout.on('data', (chunk) => {
        // If Codex does write to stdout, mirror it to our primary log
        fs.appendFileSync(logPath, chunk.toString());
      });
      p.on('close', (code) => resolve(code ?? 1));
    });

    // After process exits, find the latest session log
    const sessionsDir = path.join(os.homedir(), '.codex', 'sessions');
    let finalOutput = '';
    let detectedModel: string | undefined = model;

    try {
      const latest = this.findLatestFile(sessionsDir);
      if (!latest) {
        throw new Error('No Codex session logs found');
      }
      const jsonl = fs.readFileSync(latest, 'utf-8');
      const lines = jsonl.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          // Save raw JSON with timestamp if requested
          if (rawJsonLogPath) {
            const ts = new Date().toISOString();
            fs.appendFileSync(rawJsonLogPath, JSON.stringify({ timestamp: ts, ...obj }) + '\n');
          }
          // Extract model if present
          if (!detectedModel && (obj.model || obj.message?.model)) {
            detectedModel = obj.model || obj.message?.model;
          }
          // Reasoning/events to reasoning log in a generic way
          const ts = new Date().toISOString().replace('T', ' ').slice(0, -5);
          const type = obj.type || obj.event || 'data';
          const content = obj.reasoning || obj.message?.content || obj.output_text || obj.result || '';
          fs.appendFileSync(reasoningLogPath, `[${ts}] [${String(type).toUpperCase()}] ${typeof content === 'string' ? content : JSON.stringify(content)}\n`);

          // Final output text if present
          if (typeof obj.output_text === 'string') {
            finalOutput += obj.output_text;
          } else if (typeof obj.result === 'string') {
            finalOutput += obj.result;
          }
        } catch (e) {
          // If a line isn't JSON, write it verbatim
          fs.appendFileSync(reasoningLogPath, line + '\n');
        }
      }
      // Also mirror final output to main log if we captured any
      if (finalOutput) fs.appendFileSync(logPath, finalOutput);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fs.appendFileSync(reasoningLogPath, `\n[ERROR] Failed to parse Codex session log: ${msg}\n`);
    }

    const end = new Date();
    const footer = `\n-------------------------------------------------\n--- Codex finished at: ${end.toISOString()} ---\n--- Exit Code: ${code} ---\n`;
    fs.appendFileSync(logPath, footer);
    fs.appendFileSync(reasoningLogPath, footer);
    if (rawJsonLogPath) fs.appendFileSync(rawJsonLogPath, footer);

    return { code, output: finalOutput, modelUsed: detectedModel };
  }

  private findLatestFile(dir: string): string | null {
    try {
      const entries = fs.readdirSync(dir).map((name) => {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        return { name: full, mtime: stat.mtimeMs };
      });
      if (entries.length === 0) return null;
      entries.sort((a, b) => b.mtime - a.mtime);
      return entries[0].name;
    } catch {
      return null;
    }
  }
}

