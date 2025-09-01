Of course. Now that the foundational multi-provider abstraction is in place, we can proceed with the more advanced and complex task of enabling real-time interactive halting for the Codex provider.

This plan details the steps required to transform the `CodexProvider` from a simple "run-then-parse" model to the sophisticated "run-and-monitor" model needed for `autonomyLevel` to function.

---

# PLAN: Enable Interactive Halting for the Codex AI Provider

## 1. Title & Goal

**Title:** Implement Real-Time Monitoring for the Codex Provider to Support Interactive Halting

**Goal:** To refactor the `CodexProvider` to monitor the `codex` CLI's session logs in real-time, enabling it to detect pause signals and support the `autonomyLevel` feature, bringing its interactive capabilities in line with the `ClaudeProvider`.

## 2. Why This is a Complex Change

This is not a simple feature addition. It requires changing our fundamental interaction model with the Codex CLI.

*   **Current Model (Post-Execution):** We run `codex exec`, wait for it to finish, and then parse the complete log file it created. This is simple and reliable.
*   **New Model (Real-Time Monitoring):** We must watch the Codex session log file *as it is being written to disk*, parsing new data chunks the moment they appear to look for the `cat-herder ask` signal. This is complex because it relies on the internal, undocumented logging behavior of the Codex CLI, making it potentially fragile.

This plan outlines how to build this real-time monitoring system safely and robustly.

## 3. Summary Checklist

-   [ ] **Phase 1: Implement Real-Time Log Monitoring in `CodexProvider`**
    -   Refactor the `runStreaming` method to watch and incrementally parse the active session log file.
-   [ ] **Phase 2: Adapt Orchestrator for Codex Resumption**
    -   Ensure the `step-runner` and `prompt-builder` can correctly resume a paused Codex step.
-   [ ] **Phase 3: Update Validator and Configuration**
    -   Remove the "unsupported feature" warnings for `autonomyLevel` for the Codex provider.
-   [ ] **Phase 4: Implement a Robust Testing Strategy**
    -   Create new tests specifically for the interactive halting and resumption flow with Codex.
-   [ ] **Phase 5: Update Documentation**
    -   Update the `README.md` and `ARCHITECTURE.MD` to reflect that `autonomyLevel` is now a fully supported feature for the Codex provider.

## 4. Detailed Implementation Steps

### Phase 1: Implement Real-Time Log Monitoring in `CodexProvider`

-   **Objective:** To transform `CodexProvider.runStreaming` from a simple asynchronous process into a stateful monitor that can detect events in real-time.
-   **File to Modify:** `src/tools/ai/codex-provider.ts`
-   **Tasks:**
    1.  **Add `chokidar` for File Watching:** Import the `chokidar` library, which is already a project dependency.
    2.  **Refactor `runStreaming`:** The entire method needs to be wrapped in a `Promise` that only resolves or rejects when the process ends or a signal is detected.
    3.  **Identify the Active Log File:**
        *   **Before** spawning `codex exec`, get a list of all existing `.jsonl` files in the `~/.codex/sessions/` directory.
        *   **After** spawning the process, wait a brief moment (e.g., 250ms) and scan the directory again to identify the newly created log file. This is the "active session log".
    4.  **Watch and Parse Incrementally:**
        *   Create a `chokidar` watcher on the active session log file.
        *   Maintain a variable, `lastReadPosition`, initialized to `0`.
        *   On the `'change'` event from `chokidar`, read the file from `lastReadPosition` to its new size.
        *   Process the new chunk of data, which may contain one or more complete JSON lines. Parse each line.
    5.  **Detect the Signal and Terminate:**
        *   Inside the incremental parser, look for a JSON object representing the `cat-herder ask` command (`type: 'function_call'`, `name: 'shell'`, etc.).
        *   When this signal is found:
            1.  Gracefully kill the `codex exec` child process using `childProcess.kill()`.
            2.  Clean up the file watcher (`watcher.close()`).
            3.  **Reject** the main promise with a `new HumanInterventionRequiredError(question)`. This is the crucial signal to the orchestrator.
    6.  **Handle Normal Process Exit:**
        *   If the `codex exec` process exits normally (the `'close'` event fires), clean up the watcher and **resolve** the promise with the final `StreamResult`, just as before.

-   **Code Structure Snippet (`src/tools/ai/codex-provider.ts`):**
    ```typescript
    import chokidar from 'chokidar';
    import { spawn } from 'node:child_process';
    import { HumanInterventionRequiredError } from '../orchestration/errors.js';

    // Inside the CodexProvider class
    public runStreaming(...): Promise<StreamResult> {
      return new Promise((resolve, reject) => {
        // 1. Find the new log file after spawning 'codex exec'
        const childProcess = spawn('codex', ['exec', ...]);
        const activeLogFile = this.findActiveLogFile();

        let lastReadPosition = 0;
        const watcher = chokidar.watch(activeLogFile);

        watcher.on('change', (path) => {
          // 2. Read new data from lastReadPosition
          const newData = this.readNewData(path, lastReadPosition);
          lastReadPosition += newData.length;

          // 3. Parse new lines and check for the signal
          const signal = this.findAskSignalInChunk(newData);
          if (signal) {
            childProcess.kill();
            watcher.close();
            reject(new HumanInterventionRequiredError(signal.question));
          }
        });

        childProcess.on('close', (code) => {
          watcher.close();
          // 4. If it closes normally, parse the full log and resolve
          const finalResult = this.parseFullLog(activeLogFile);
          resolve(finalResult);
        });

        childProcess.on('error', (err) => {
          watcher.close();
          reject(err);
        });
      });
    }
    ```

### Phase 2: Adapt Orchestrator for Codex Resumption

-   **Objective:** Ensure that when a Codex step is paused and then resumed, the AI receives the full context of its previous actions and the user's answer.
-   **Files to Modify:** `src/tools/orchestration/step-runner.ts`, `src/tools/orchestration/prompt-builder.ts`
-   **Tasks:**
    1.  **Verify `step-runner.ts` Logic:** The `try...catch (error)` block in `executeStep` that handles the `HumanInterventionRequiredError` is already provider-agnostic. Confirm that it correctly catches the error thrown by the new `CodexProvider` and proceeds to the "resume" logic.
    2.  **Enhance `prompt-builder.ts`:**
        *   The `assemblePrompt` function already includes the `interactionHistory`. When resuming a Codex step, this history will now contain the question and the new answer.
        *   **Crucially,** for a Codex resumption, we must also feed it the reasoning log from its *previous, interrupted attempt*. Modify the `executeStep` function to read the partial `.reasoning.log` file and pass its content as a new context item (e.g., `previousAttemptLog`) to `assemblePrompt`.
        *   Update `assemblePrompt` to format and include this `previousAttemptLog` in the new prompt, giving the AI a memory of what it did before it was paused.

### Phase 3: Update Validator and Configuration

-   **Objective:** To officially recognize `autonomyLevel` as a supported feature for Codex and remove unnecessary warnings.
-   **File to Modify:** `src/tools/validator.ts`
-   **Tasks:**
    1.  **Remove the `autonomyLevel` Warning:** In the section that checks `if (config.aiProvider === 'codex')`, remove the code that warns the user about `autonomyLevel` being unsupported.
    2.  **Keep the `fileAccess` Warning:** The `fileAccess` guardrail feature is **still not supported** because it relies on a pre-execution hook that Codex does not have. The warning for this feature should remain.

### Phase 4: Implement a Robust Testing Strategy

-   **Objective:** To verify that the complex real-time monitoring and resumption flow works correctly under various conditions.
-   **Tasks:**
    1.  **Create New Integration Tests (`test/orchestrator-codex-interaction.test.ts`):**
        *   Create a test that runs a pipeline with `aiProvider: 'codex'` and `autonomyLevel: 3`.
        *   Mock the `codex` CLI. The mock should:
            1.  Create a fake `rollout-....jsonl` file.
            2.  Write a few initial JSON log entries to it.
            3.  Then, write the key `function_call` entry for `cat-herder ask`.
            4.  Wait for the test runner to kill its process.
        *   Assert that `cat-herder` correctly pauses, prompts for input (mocked), and then re-spawns the `codex` CLI with a new prompt containing the answer.

### Phase 5: Update Documentation

-   **Objective:** To accurately reflect the new capabilities in all user- and developer-facing documentation.
-   **Tasks:**
    1.  **Update `README.md`:** In the "AI Providers" section, remove the note that `autonomyLevel` is not supported for Codex.
    2.  **Update `ARCHITECTURE.MD`:** In the "AI Provider Layer" section, update the description for `CodexProvider` to explain its new "run-and-monitor" model, detailing how it watches session logs to enable interactive features.