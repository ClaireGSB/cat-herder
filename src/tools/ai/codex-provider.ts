import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { AIProvider } from './ai-provider.js';
import type { RunStreamingOptions, StreamResult } from '../proc.js';
import { HumanInterventionRequiredError } from '../orchestration/errors.js';

/**
 * CodexProvider: Executes `codex exec` and, after completion, parses the
 * latest JSONL session log from ~/.codex/sessions to assemble output and
 * reasoning logs. This is a best-effort parser to fit our StreamResult.
 */
export class CodexProvider implements AIProvider {
  // Exposed for tests: detect a 'cat-herder ask' signal and extract a question if possible
  static detectAskSignal(payload: unknown, rawLine?: string): { question?: string } | null {
    try {
      const obj: any = payload && typeof payload === 'object' ? payload : {};
      // Check common structured shapes
      const textCandidates: string[] = [];
      if (typeof obj?.output_text === 'string') textCandidates.push(obj.output_text);
      if (typeof obj?.result === 'string') textCandidates.push(obj.result);
      if (typeof obj?.message?.content === 'string') textCandidates.push(obj.message.content);
      if (typeof obj?.content === 'string') textCandidates.push(obj.content);
      if (typeof obj?.arguments === 'string') textCandidates.push(obj.arguments);
      if (typeof obj?.input === 'string') textCandidates.push(obj.input);

      const joined = textCandidates.join('\n');
      const haystack = (joined + '\n' + (rawLine || '')).toLowerCase();
      if (haystack.includes('cat-herder ask')) {
        // Try to extract a quoted question
        const m = /cat-herder\s+ask[^\"\n]*\"([^\"]+)\"/i.exec(rawLine || joined);
        return m ? { question: m[1] } : { question: undefined };
      }

      // Check function/tool call shapes for shell commands including cat-herder ask
      const possibleArgs = [obj?.function_call?.arguments, obj?.tool_call?.arguments, obj?.call?.arguments, obj?.args];
      for (const a of possibleArgs) {
        if (typeof a === 'string' && a.toLowerCase().includes('cat-herder ask')) {
          const m = /cat-herder\s+ask[^\"\n]*\"([^\"]+)\"/i.exec(a);
          return m ? { question: m[1] } : { question: undefined };
        }
      }
    } catch {}
    return null;
  }
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
    fs.appendFileSync(reasoningLogPath, header + `--- This file contains Codex reasoning (real-time assembled) ---\n`);
    if (stdinData) {
      fs.appendFileSync(logPath, `\n--- PROMPT DATA ---\n${stdinData}\n--- END PROMPT DATA ---\n\n`);
    }
    const sessionsDir = process.env.CODEX_SESSIONS_DIR || path.join(os.homedir(), '.codex', 'sessions');
    const preExisting = this.listJsonlFilesSafe(sessionsDir);

    const args: string[] = ['exec'];
    if (model) args.push('--model', model);

    // Map cat-herder Codex config to --config flags
    const cfg = options?.settings?.codex;
    const addConfig = (key: string, valueToml: string | boolean | number | string[]) => {
      let v: string;
      if (Array.isArray(valueToml)) {
        v = `[${valueToml.map((s) => JSON.stringify(s)).join(', ')}]`;
      } else if (typeof valueToml === 'string') {
        v = JSON.stringify(valueToml);
      } else if (typeof valueToml === 'boolean' || typeof valueToml === 'number') {
        v = String(valueToml);
      } else {
        return; // ignore
      }
      args.push('--config', `${key}=${v}`);
    };

    if (cfg?.profile) {
      args.push('--profile', cfg.profile);
    }

    if (cfg?.sandboxMode) {
      addConfig('sandbox_mode', cfg.sandboxMode);
      if (cfg.sandboxMode === 'workspace-write' && typeof cfg.networkAccess === 'boolean') {
        addConfig('sandbox_workspace_write.network_access', cfg.networkAccess);
      }
    }

    const ep = cfg?.envPolicy;
    if (ep) {
      if (ep.inherit) addConfig('shell_environment_policy.inherit', ep.inherit);
      if (typeof ep.ignoreDefaultExcludes === 'boolean') addConfig('shell_environment_policy.ignore_default_excludes', ep.ignoreDefaultExcludes);
      if (ep.exclude && ep.exclude.length) addConfig('shell_environment_policy.exclude', ep.exclude);
      if (ep.includeOnly && ep.includeOnly.length) addConfig('shell_environment_policy.include_only', ep.includeOnly);
      if (ep.set && Object.keys(ep.set).length) {
        const entries = Object.entries(ep.set).map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`);
        args.push('--config', `shell_environment_policy.set = { ${entries.join(', ')} }`);
      }
    }

    let child: ChildProcess | null = null;
    let completed = false;
    let activeLogPath: string | null = null;
    let lastRead = 0;
    let buffer = '';
    let finalOutput = '';
    let detectedModel: string | undefined = model;

    const writeReasoning = (line: string) => {
      fs.appendFileSync(reasoningLogPath, line);
    };

    const writeRawJson = (obj: any) => {
      if (!rawJsonLogPath) return;
      const ts = new Date().toISOString();
      fs.appendFileSync(rawJsonLogPath, JSON.stringify({ timestamp: ts, ...obj }) + '\n');
    };

    const finish = (code: number) => {
      if (completed) return; completed = true;
      const end = new Date();
      const footer = `\n-------------------------------------------------\n--- Codex finished at: ${end.toISOString()} ---\n--- Exit Code: ${code} ---\n`;
      fs.appendFileSync(logPath, footer);
      fs.appendFileSync(reasoningLogPath, footer);
      if (rawJsonLogPath) fs.appendFileSync(rawJsonLogPath, footer);
    };

    const parseChunk = (chunk: string): { ask?: { question?: string } } => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          writeRawJson(obj);
          if (!detectedModel && (obj.model || obj.message?.model)) detectedModel = obj.model || obj.message?.model;
          const ts = new Date().toISOString().replace('T', ' ').slice(0, -5);
          const type = (obj.type || obj.event || 'data').toString().toUpperCase();
          const content = obj.reasoning || obj.message?.content || obj.output_text || obj.result || '';
          writeReasoning(`[${ts}] [${type}] ${typeof content === 'string' ? content : JSON.stringify(content)}\n`);
          const ask = CodexProvider.detectAskSignal(obj, line);
          if (ask) return { ask };
          if (typeof obj.output_text === 'string') finalOutput += obj.output_text;
          else if (typeof obj.result === 'string') finalOutput += obj.result;
        } catch {
          // Non-JSON lines: still mirror to reasoning
          writeReasoning(line + '\n');
          if (line.toLowerCase().includes('cat-herder ask')) {
            const m = /cat-herder\s+ask[^\"\n]*\"([^\"]+)\"/i.exec(line);
            return { ask: { question: m ? m[1] : undefined } };
          }
        }
      }
      return {};
    };

    const tailNewData = async (filePath: string): Promise<{ ask?: { question?: string } }> => {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size <= lastRead) return {};
        const stream = fs.createReadStream(filePath, { start: lastRead, end: stat.size - 1, encoding: 'utf-8' });
        let data = '';
        await new Promise<void>((resolve) => {
          stream.on('data', (c) => { data += c; });
          stream.on('end', resolve);
          stream.on('error', () => resolve());
        });
        lastRead = stat.size;
        return parseChunk(data);
      } catch {
        return {};
      }
    };

    const code: number = await new Promise<number>((resolve, reject) => {
      const spawnTime = Date.now();
      child = spawn('codex', args, { cwd, stdio: 'pipe', shell: false });
      if (stdinData && child.stdin) {
        child.stdin.write(stdinData);
        child.stdin.end();
      }
      // Probe stdout/stderr for a session path hint
      const pathHintRegex = /(\S*\.codex\S*sessions\S*\.jsonl)/i;
      const onData = (chunk: Buffer) => {
        const s = chunk.toString();
        fs.appendFileSync(logPath, s);
        const m = pathHintRegex.exec(s);
        if (!activeLogPath && m) {
          const pth = m[1].replace(/\u001b\[[0-9;]*m/g, '');
          if (fs.existsSync(pth)) activeLogPath = pth;
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', (chunk) => {
        const ts = new Date().toISOString();
        fs.appendFileSync(reasoningLogPath, `[${ts}] [STDERR] ${chunk.toString()}\n`);
        onData(chunk);
      });

      // Resolve active session file: prefer hint; else discover new file
      const watcherReady = (async () => {
        const timeoutMs = 10000;
        const startWait = Date.now();
        while (!activeLogPath) {
          // Check timeout
          if (Date.now() - startWait > timeoutMs) break;
          const candidates = this.findNewSessionFiles(sessionsDir, preExisting, spawnTime);
          if (candidates.length > 0) {
            activeLogPath = candidates[0];
            break;
          }
          await new Promise(r => setTimeout(r, 200));
        }
        if (!activeLogPath) throw new Error(`Failed to locate active Codex session log in ${sessionsDir}`);
        // Initialize lastRead to current size and write any initial content into reasoning
        try {
          const st = fs.statSync(activeLogPath);
          lastRead = 0;
          // Read initial content as a baseline
          await tailNewData(activeLogPath);
        } catch {}
        return activeLogPath;
      })();

      let fileWatcher: FSWatcher | null = null;
      let killing = false;

      watcherReady.then((filePath) => {
        fileWatcher = chokidar.watch(filePath, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } });
        const handleChange = async () => {
          const { ask } = await tailNewData(filePath);
          if (ask && !completed && !killing) {
            killing = true;
            // Attempt graceful termination
            if (child && child.pid) child.kill('SIGINT');
            setTimeout(() => { if (child && child.exitCode === null) child.kill('SIGTERM'); }, 1000);
            setTimeout(() => { if (child && child.exitCode === null) child.kill('SIGKILL'); }, 3000);
            // Ensure cleanup and propagate pause
            if (fileWatcher) { fileWatcher.close().catch(() => {}); fileWatcher = null; }
            finish(130);
            return reject(new HumanInterventionRequiredError(ask.question || 'The AI requested human input.'));
          }
        };
        fileWatcher.on('change', handleChange);
        // Also tail once immediately to catch any early lines
        handleChange();
      }).catch((e) => {
        // Could not find log file; we will just wait for child to exit and then parse post-hoc
        fs.appendFileSync(reasoningLogPath, `[WARN] ${e instanceof Error ? e.message : String(e)}\n`);
      });

      const cleanup = () => {
        if (fileWatcher) { fileWatcher.close().catch(() => {}); fileWatcher = null; }
      };

      child.on('close', async (code) => {
        cleanup();
        // If we had a log file, consume any remaining tail
        if (activeLogPath) await tailNewData(activeLogPath);
        finish(code ?? 1);
        resolve(code ?? 1);
      });

      child.on('error', (err) => {
        cleanup();
        finish(1);
        reject(err);
      });
    });

    return { code, output: finalOutput, modelUsed: detectedModel };
  }

  private listJsonlFilesSafe(dir: string): string[] {
    const results: string[] = [];
    const walk = (d: string) => {
      try {
        for (const entry of fs.readdirSync(d)) {
          const full = path.join(d, entry);
          try {
            const st = fs.statSync(full);
            if (st.isDirectory()) walk(full);
            else if (st.isFile() && full.endsWith('.jsonl')) results.push(full);
          } catch {}
        }
      } catch {}
    };
    walk(dir);
    return results.sort((a, b) => (fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs));
  }

  private findNewSessionFiles(dir: string, preExisting: string[], sinceMs: number): string[] {
    const preSet = new Set(preExisting);
    const files = this.listJsonlFilesSafe(dir).filter(f => !preSet.has(f));
    return files.filter(f => {
      try { return fs.statSync(f).mtimeMs >= sinceMs; } catch { return false; }
    });
  }
}
