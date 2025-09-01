

Here is an updated breakdown of what remains to be done, aligned with the latest decisions (keep provider logs as-is; add Codex colorization in the UI; no fallback for prompt locations since this is still in dev).

### Summary of Remaining Tasks

| Category                         | Task                                                                                                                              | Status      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **1. UI/UX Parity**              | Add Codex-aware colorization in UI (keep provider logs as-is; no harmonization layer).                                               | ✅ Completed |
| **2. Config & Project Structure**| Migrate command prompts from `.claude/commands` to a neutral `.cat-herder/steps` directory (no fallback).                            | ✅ Completed |
| **3. Final Polish**              | Update all documentation and run final E2E tests for both providers to ensure no regressions were introduced.                      | In Progress |

---

### Detailed Plan for Remaining Tasks

#### 1. Task: UI/UX Parity via Codex Colorization (Completed)

**Decision:** Keep provider logs as they are; do not harmonize formats. Add colorization for Codex tokens in the UI only.

**What we implemented:**

- Client-side tokenizer now recognizes `[FUNCTION_CALL]`, `[FUNCTION_CALL_OUTPUT]`, `[STDERR]`, `[ERROR]`, and `[RESULT]` and applies existing styles (tool, error, info).
- No server/provider changes required; resilience preserved if Codex format evolves (unmatched lines render as plain text).

**Files touched (already done):**

- `src/public/js/dashboard.js` (tokenizer updates) and `src/templates/web/partials/header.ejs` (CSS for errors).

#### 2. Task: Migrate Command Prompts to a Neutral Directory

**The Problem:** The `.claude/commands` directory name is now misleading and provider-specific. It needs to be moved to a neutral location. This is a **breaking change** for existing users and must be handled gracefully.

**The Solution:** Move the directory (no fallback since single dev user during early development).

1.  **Choose a New Location:** `.cat-herder/steps`.

2.  **Update `init` Command (`src/init.ts`):**
    - Create `.cat-herder/steps/` and populate it with the default prompt templates (moved from `src/dot-claude/commands`).
    - Keep `.claude/settings.json` scaffolding for Claude only (unchanged).

3.  **Update Core Logic to Find Prompts:**
    - In `src/tools/orchestration/pipeline-runner.ts`, change prompt file resolution to use only the new location: `path.join(projectRoot, '.cat-herder', 'steps', `${command}.md`)`.
    - Remove any remaining references to `.claude/commands` for prompt loading.

4.  **Build & Packaging:**
    - Update `package.json` build step to copy `.cat-herder/steps` templates into `dist` (replacing the prior `dot-claude/commands` copy for prompts).
    - Update `src/config.ts#getCommandTemplatePath` to point to the new steps template location.

5.  **Validator Adjustments:**
    - Update `src/tools/validator.ts` to check the command file path in `.cat-herder/steps/${command}.md` for frontmatter (allowed-tools), while keeping `.claude/settings.json` validation only for Claude.

#### 3. Task: Final Polish and Verification

**The Problem:** After making significant changes to UI parsing and file structures, we need to ensure nothing has broken and that the documentation is up-to-date.

**The Solution:**

1.  **Update Documentation:**
    *   **`README.md`:** Update all paths that reference `.claude/commands` to point to the new `.cat-herder/steps` directory.
    *   **`ARCHITECTURE.MD`:** Update the "Key Directories" section with the new path.
2.  **End-to-End Testing:**
    *   Perform a full `cat-herder run` for a sample task using the **Claude** provider to ensure the directory migration didn’t regress behavior.
    *   Perform a full `cat-herder run` for a sample task using the **Codex** provider to verify the UI colorization works as expected.

---

Additional Notes

- Token usage reporting for Codex remains “not available” today; leave token usage aggregation unchanged for Codex to avoid misleading totals.
- Parallel Codex runs are supported by the provider’s session discovery logic; no extra UI work required.

Once these three major tasks are complete, your feature integration will be functionally complete, architecturally sound, and user-friendly.
