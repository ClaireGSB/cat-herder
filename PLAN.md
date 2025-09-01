Now that the multi-provider abstraction is in place, this plan focuses on enabling real-time interactive halting for the Codex provider with production-grade safety and testability. It replaces the simple "run-then-parse" model with a robust "run-and-monitor" approach while minimizing changes to orchestrator logic.

---

# PLAN: Enable Interactive Halting for the Codex AI Provider (Revised)

## 1. Title & Goal

**Title:** Real-Time Monitoring for the Codex Provider to Support Interactive Halting

**Goal:** Refactor `CodexProvider` to detect pause signals from the Codex session log in real time and interoperate with the existing orchestrator pause/resume flow (HumanInterventionRequiredError), achieving parity with Claude for `autonomyLevel` behavior.

## 2. Scope Notes

- Rate-limit awareness for Codex is explicitly out of scope for this iteration; we will revisit once signaling is known.
- `fileAccess` guardrails remain unsupported for Codex.

## 3. Summary Checklist

- [x] Phase 1: Implement robust real-time monitoring in CodexProvider
- [x] Phase 2: Verify orchestrator resume flow (no prompt-builder changes)
- [x] Phase 3: Add comprehensive tests with session-dir override
- [x] Phase 4: Enable Codex autonomy in validator (post-validation gate)
- [x] Phase 5: Documentation updates (README, ARCHITECTURE)

## 4. Detailed Implementation Steps

### Phase 1: Robust Real-Time Monitoring in `CodexProvider`

- Objective: Transform `runStreaming` into a stateful, incremental JSONL parser with reliable session-file discovery and clean lifecycle management.
- File: `src/tools/ai/codex-provider.ts`
- Tasks:
  1. Session file discovery (deterministic):
     - If Codex prints the active session path on stdout/stderr, parse it and prefer that.
     - Support `CODEX_SESSIONS_DIR` env override for tests and custom setups.
     - Otherwise: record pre-spawn file set and spawn timestamp; after spawn, poll the sessions dir to find the newest file created after the timestamp; verify it grows and contains JSONL before watching. Add timeout with a clear error if not found (e.g., 10s).
  2. Incremental parsing:
     - Use `chokidar` to watch the active JSONL file.
     - Maintain an internal buffer and `lastReadPosition`; on change, read only new bytes and split by newline, carrying incomplete tails.
     - Tolerate non-JSON lines; log and continue.
     - Pluggable “ask” detector: handle both `function_call`-like shapes and a text fallback that matches `cat-herder ask` intent. Centralize in a helper.
  3. Pause detection and termination:
     - On detecting an ask signal, gracefully end the child (`SIGINT` then `SIGTERM` after a short grace period), close watcher, reject with `HumanInterventionRequiredError(question)`.
     - Ensure idempotent resolve/reject with a `done` flag to avoid double completion.
  4. Normal completion:
     - On process close, stop watcher, then parse remaining file tail and assemble `StreamResult` (as today), writing to logs consistently with Claude.
  5. Resource hygiene and resilience:
     - Always close streams/watchers on all exit paths.
     - Handle file rename/rotation events by re-attaching if needed.
     - For large files, use ranged reads (`fs.createReadStream({ start })`) to avoid re-reading the full file.

### Phase 2: Orchestrator Resume Flow Verification

- Objective: Confirm that existing orchestration handles Codex pauses without code changes.
- Files: `src/tools/orchestration/step-runner.ts`
- Tasks:
  - Ensure `CodexProvider` throws `HumanInterventionRequiredError` on ask detection.
  - Confirm `step-runner` catches it, records the pending question, prompts the user, resumes, and injects prior reasoning (the current implementation already reads and includes previous reasoning; no prompt-builder change required).

### Phase 3: Testing Strategy (with Session Dir Override)

- Objective: Make the new behavior verifiable and robust under edge cases.
- Tasks:
  - Add `CODEX_SESSIONS_DIR` support in `CodexProvider`.
  - Create `test/orchestrator-codex-interaction.test.ts` that:
    - Sets `aiProvider: 'codex'` and `autonomyLevel: 3` (expect pause).
    - Mocks a fake Codex child that writes to a temp sessions dir: initial events → ask signal → waits.
    - Asserts orchestrator pauses, captures question, resumes with an answer, and calls Codex again.
  - Add tests for edge cases: slow file creation (timeout), non-JSON noise, very long lines, concurrent sessions (select correct one), and file rename.

### Phase 4: Validator & Configuration Gate

- Objective: Enable Codex `autonomyLevel` only after tests pass; keep warnings until then.
- File: `src/tools/validator.ts`
- Tasks:
  - Keep `autonomyLevel` warning for Codex until Phase 1–3 are complete and validated.
  - After validation, remove the warning so Codex fully supports autonomy.
  - Keep `fileAccess` warning (still unsupported).

### Phase 5: Documentation

- Objective: Accurately reflect Codex parity for autonomy once shipped.
- Tasks:
  - README: In AI Providers, remove the “autonomyLevel unsupported” note; add a short note on how Codex monitoring works at a high level.
  - ARCHITECTURE: Update AI Provider Layer to describe Codex run-and-monitor model and its watcher/parse flow.

## 5. Future Work (Out of Scope Now)

- Rate-limit awareness for Codex (pending signal format discovery).
