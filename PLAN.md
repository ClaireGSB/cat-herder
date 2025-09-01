

Here is a breakdown of what remains to be done, framed as a clear action plan.

### Summary of Remaining Tasks

| Category                         | Task                                                                                                                              | Status      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **1. UI/UX Parity**              | Refactor log parsing to support provider-specific formats, ensuring the UI can colorize and structure logs from both Claude and Codex. | **Not Started** |
| **2. Config & Project Structure**| Migrate command prompts from the provider-specific `.claude/commands` to a neutral `.cat-herder/steps` directory.                | **Not Started** |
| **3. Final Polish**              | Update all documentation and run final E2E tests for both providers to ensure no regressions were introduced.                      | **Not Started** |

---

### Detailed Plan for Remaining Tasks

#### 1. Task: Standardize Log Parsing for the UI

**The Problem:** The web UI's log viewer (`_live-log-viewer.ejs` and its client-side JS) expects log data in the specific format streamed by the `claude` CLI. The `CodexProvider`'s log parser produces a different structure. We need a way to bridge this gap so the UI doesn't need to know which provider is active.

**The Solution (The Right Way):** Do not make the UI smarter. Make the providers conform to a standard format.

1.  **Define a Standardized Log Event Interface:**
    *   Create a simple, internal type in `src/types.ts` that represents a generic log event for the UI. This abstracts away the provider-specific details.
    *   **Example (`src/types.ts`):**
        ```typescript
        export type UILogEventType = 'reasoning' | 'tool-input' | 'tool-output' | 'error' | 'final-result';

        export interface StandardizedLogEvent {
          type: UILogEventType;
          timestamp: string;
          content: string;
          provider: 'claude' | 'codex'; // Useful for provider-specific styling
        }
        ```

2.  **Update Providers to Emit Standardized Events:**
    *   **`ClaudeProvider`:** Modify the `runStreaming` logic in `src/tools/proc.ts` (or its new home). As it parses the `claude` JSON stream, it should map each event to a `StandardizedLogEvent` before sending it over the WebSocket.
    *   **`CodexProvider`:** As the `CodexProvider` parses the JSONL log file, it should map each log entry (`reasoning`, `function_call`, `output_text`, etc.) to a `StandardizedLogEvent` and write that to the `.reasoning.log` file.

3.  **Refactor the Web UI to Consume the Standardized Format:**
    *   Update the WebSocket server (`src/tools/web/websockets.ts`) to send these standardized events.
    *   Update the client-side JavaScript (`src/public/js/live-activity-page.js`) to parse these events and apply CSS classes based on the `type` and `provider` fields. This will allow you to have distinct styling for Claude's reasoning versus Codex's reasoning if you choose.

#### 2. Task: Migrate Command Prompts to a Neutral Directory

**The Problem:** The `.claude/commands` directory name is now misleading and provider-specific. It needs to be moved to a neutral location. This is a **breaking change** for existing users and must be handled gracefully.

**The Solution:** Move the directory and provide a backward-compatibility layer.

1.  **Choose a New Location:** `.cat-herder/steps` is a good, descriptive name. Let's proceed with that.

2.  **Update `init` Command (`src/init.ts`):**
    *   Modify the `init` command to create `.cat-herder/steps/` instead of `.claude/commands/`.
    *   It should populate this new directory with the default prompt templates.

3.  **Update Core Logic to Find Prompts:**
    *   In `src/tools/orchestration/step-runner.ts`, modify the logic that constructs the path to the command prompt markdown file.
    *   **Implement a Graceful Fallback:** To avoid breaking existing projects, the logic should be:
        1.  First, look for the command file in the **new location**: `path.join(projectRoot, '.cat-herder', 'steps', `${command}.md`)`.
        2.  If it's **not found there**, then look in the **old location**: `path.join(projectRoot, '.claude', 'commands', `${command}.md`)`.
        3.  If the file is found in the old location, print a one-time, non-intrusive deprecation warning to the console:
            > `Warning: Command prompts in '.claude/commands/' are deprecated. Please move them to '.cat-herder/steps/'.`

4.  **Optional (Best UX): Add an Automatic Migration Tool:**
    *   Create a new command, `cat-herder migrate`, that automatically detects an old `.claude/commands` directory and renames it to `.cat-herder/steps` for the user. This makes the transition seamless.

#### 3. Task: Final Polish and Verification

**The Problem:** After making significant changes to UI parsing and file structures, we need to ensure nothing has broken and that the documentation is up-to-date.

**The Solution:**

1.  **Update Documentation:**
    *   **`README.md`:** Update all paths that reference `.claude/commands` to point to the new `.cat-herder/steps` directory.
    *   **`ARCHITECTURE.MD`:** Update the "Key Directories" section with the new path.
2.  **End-to-End Testing:**
    *   Perform a full `cat-herder run` for a sample task using the **Claude** provider to ensure the directory migration and log parsing changes haven't caused any regressions.
    *   Perform a full `cat-herder run` for a sample task using the **Codex** provider to verify that the new UI parsing and logging works as expected.

Once these three major tasks are complete, your feature integration will be functionally complete, architecturally sound, and user-friendly.