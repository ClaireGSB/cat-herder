import { describe, it, expect } from 'vitest';
import { CodexProvider } from '../src/tools/ai/codex-provider.js';

describe('CodexProvider.detectAskSignal', () => {
  it('detects ask from output_text with quoted question', () => {
    const payload = { output_text: 'running: cat-herder ask "Proceed with deployment?"' };
    const res = CodexProvider.detectAskSignal(payload);
    expect(res).not.toBeNull();
    expect(res?.question).toBe('Proceed with deployment?');
  });

  it('detects ask from function_call arguments', () => {
    const payload = { function_call: { name: 'shell', arguments: 'cat-herder ask "Need DB creds"' } };
    const res = CodexProvider.detectAskSignal(payload);
    expect(res).not.toBeNull();
    expect(res?.question).toBe('Need DB creds');
  });

  it('falls back to raw line parsing', () => {
    const raw = '... executing: cat-herder ask "Are you sure?" ...';
    const res = CodexProvider.detectAskSignal({}, raw);
    expect(res).not.toBeNull();
    expect(res?.question).toBe('Are you sure?');
  });
});

