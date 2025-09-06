class CatHerderDashboard {
    constructor() {
        this.websocket = null;
        this.reconnectInterval = 5000;
        this.currentWatchedLogFile = null;
        this.currentTaskPhase = null;
    }

    initWebSocket() {
        if (typeof WebSocket === 'undefined') {
            console.error("WebSockets are not supported in this browser.");
            return;
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => console.log('[Dashboard.js] WebSocket connected. Listening for updates...');

        this.websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[Dashboard.js] WebSocket message received:', data); 
                this.handleRealtimeUpdate(data);
            } catch (e) {
                console.error('[Dashboard.js] Failed to parse WebSocket message:', e, 'Raw data:', event.data); 
            }
        };

        this.websocket.onclose = () => {
            console.log('WebSocket disconnected. Attempting to reconnect in 5 seconds...');
            setTimeout(() => this.initWebSocket(), this.reconnectInterval);
        };

        this.websocket.onerror = (error) => console.error('WebSocket error:', error);
    }

    handleRealtimeUpdate(data) {
        console.log(`[Dashboard.js] Handling real-time update: ${data.type}`); 
        switch (data.type) {
            case 'task_update':
                const oldTaskPhase = this.currentTaskPhase;
                this.currentTaskPhase = data.data.phase;
                const newTaskPhase = this.currentTaskPhase;

                console.log(`[Dashboard.js] Task update received: Task ID ${data.data.taskId}, Phase ${newTaskPhase}, Step ${data.data.currentStep}`); 

                // Only perform reloads if we are currently on the /live page
                if (window.location.pathname.endsWith('/live')) {
                    // SCENARIO 1: Task has been resumed (BUG FIX)
                    // This is the highest priority check - reload immediately when task resumes
                    if ((oldTaskPhase === 'interrupted' || oldTaskPhase === 'failed') && newTaskPhase === 'running') {
                        console.log(`[Dashboard.js] RESUME RELOAD: Task ${data.data.taskId} has resumed from '${oldTaskPhase}' to '${newTaskPhase}'. Triggering page reload.`);
                        window.location.reload();
                        return; // Exit to allow reload
                    }

                    // SCENARIO 2: Task in a sequence finished (DYNAMIC DISCOVERY)
                    // Reload after a task completes to discover new dynamically generated tasks
                    const currentSequence = window.liveActivityData?.parentSequence;
                    const updatedTask = data.data;
                    if (currentSequence && updatedTask.parentSequenceId === currentSequence.sequenceId &&
                        ['done', 'failed', 'interrupted'].includes(newTaskPhase) && oldTaskPhase === 'running') {
                        
                        console.log(`[Dashboard.js] DYNAMIC DISCOVERY RELOAD: Task ${updatedTask.taskId} finished with '${newTaskPhase}'. Reloading sequence view in 1.2s.`);
                        setTimeout(() => window.location.reload(), 1200); // Delay to ensure state is written
                        return; // Exit to allow reload
                    }

                    // SCENARIO 3: Critical phase transition (running <-> waiting_for_input)
                    // This forces a full re-render for UI consistency
                    if ((oldTaskPhase === 'running' && newTaskPhase === 'waiting_for_input') ||
                        (oldTaskPhase === 'waiting_for_input' && newTaskPhase === 'running')) {
                        console.log(`[Dashboard.js] CRITICAL RELOAD: Phase changed from '${oldTaskPhase}' to '${newTaskPhase}'. Triggering page reload.`); 
                        window.location.reload();
                        return; // Stop further processing to allow reload
                    }

                    // SCENARIO 4: Current step has changed for an active task
                    // This handles cases where AI moves to a new step, or the page wasn't refreshed initially.
                    // We must ensure the currentTaskInView is defined and matches the updated task.
                    const currentTaskInView = window.liveActivityData?.runningTask;
                    if (currentTaskInView && currentTaskInView.taskId === data.data.taskId &&
                        currentTaskInView.currentStep !== data.data.currentStep &&
                        (newTaskPhase === 'running' || newTaskPhase === 'waiting_for_input')) {
                        console.log(`[Dashboard.js] STEP CHANGE RELOAD: Current step changed from '${currentTaskInView.currentStep}' to '${data.data.currentStep}'. Triggering page reload.`); 
                        window.location.reload();
                        return; // Stop further processing to allow reload
                    }

                    // SCENARIO 5: Task has finished, failed, or interrupted (and was live)
                    // This ensures the page refreshes to show the final state or redirects.
                    if (window.liveActivityData.isLive && newTaskPhase !== 'running' && newTaskPhase !== 'waiting_for_input') {
                        console.log(`[Dashboard.js] FINAL STATE RELOAD: Task phase changed to '${newTaskPhase}'. Triggering page reload for final state.`); 
                        setTimeout(() => window.location.reload(), 1200);
                        return; // Stop further processing to allow reload
                    }
                }

                // If no reload was triggered, proceed with normal UI updates (e.g., status badge, minor info)
                // This is important for updates on other pages (e.g., history) and minor updates on live page
                this.updateTaskUI(data.data);
                break;
            case 'sequence_update':
                console.log(`[Dashboard.js] Sequence update received: Sequence ID ${data.data.sequenceId}, Phase ${data.data.phase}`); 
                this.updateSequenceUI(data.data);
                if (window.location.pathname.endsWith('/live')) {
                    if (['done', 'failed', 'interrupted'].includes(data.data.phase)) {
                        console.log(`[Dashboard.js] SEQUENCE FINAL: Sequence finished. Redirecting to history.`); 
                        setTimeout(() => window.location.href = '/history', 1500);
                        return;
                    }
                }
                break;
            case 'journal_updated':
                console.log(`[Dashboard.js] Journal updated event received. Path: ${window.location.pathname}`);
                // Reload if on /history, /, OR on /live when no task is currently being displayed
                if (window.location.pathname.endsWith('/history') ||
                    window.location.pathname === '/' ||
                    (window.location.pathname.endsWith('/live') && !window.liveActivityData?.runningTask)) { 
                    console.log('[Dashboard.js] JOURNAL RELOAD: Triggering page reload for history/root/inactive live.');
                    window.location.reload();
                }
                break;
            case 'log_content':
            case 'log_update':
            case 'error':
                console.log(`[Dashboard.js] Log update event received: ${data.type}`); 
                this.handleLogUpdate(data);
                break;
        }
    }

    initializeLiveView(runningTask) {
        if (!runningTask) {
            console.log("Live view initialized, no task is currently running.");
            return;
        }
        // Initialize currentTaskPhase from the initial render's task data
        this.currentTaskPhase = runningTask.phase;
        // Trigger the first UI update and log watch.
        this.updateTaskUI(runningTask);
    }

    updateTaskUI(task) {
        console.log(`[Dashboard.js] Updating Task UI for Task ID ${task.taskId}, Phase ${task.phase}, Step ${task.currentStep}`); 
        // This part updates the history page badge in real-time
        const taskRow = document.querySelector(`[data-task-id="${task.taskId}"]`);
        if (taskRow) {
            this.updateStatusBadge(taskRow.querySelector('.task-status-badge'), task.phase);
        }

        if (window.location.pathname.endsWith('/live')) {
            const runningTask = window.liveActivityData?.runningTask;
            if (!runningTask) return;

            // This part handles the log switching when a step changes,
            // which will now run after a page reload.
            const newStep = task.currentStep;
            const newLogFile = task.logs?.[newStep]?.reasoning;

            if (newLogFile && this.currentWatchedLogFile !== newLogFile) {
                console.log(`[Dashboard.js] SWITCHING LOG WATCH to ${newLogFile}`); 
                this.currentWatchedLogFile = newLogFile;
                this.watchLogFile(task.taskId, newLogFile);
            } else if (!newLogFile) { 
                console.warn(`[Dashboard.js] No reasoning log file found for step ${newStep} in task ${task.taskId}.`); 
            }

            // Update status indicators for waiting_for_input phase
            if (task.phase === 'waiting_for_input') {
                this.updateWaitingForInputUI(task);
            }

            // Existing logic to reload when the task is finished
            if (window.liveActivityData.isLive && task.phase !== 'running' && task.phase !== 'waiting_for_input') {
                console.log(`[Dashboard.js] Task phase changed to final state '${task.phase}'. Reloading to show final state.`); 
                setTimeout(() => window.location.reload(), 1200);
            }
        }
    }

    // Reusable function to send the watch_log message ---
    watchLogFile(taskId, logFile) {
        const sendRequest = () => {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                const watchMessage = { type: 'watch_log', taskId: taskId, logFile: logFile };
                this.websocket.send(JSON.stringify(watchMessage));
                console.log(`[Dashboard.js] Sent 'watch_log' message for ${logFile}`); 

                const logContainer = document.getElementById('live-log-content');
                if (logContainer) {
                    logContainer.textContent = `--- Switched to step: ${taskId} ---\nConnecting to log stream for ${logFile}...\n`;
                }
            } else {
                console.log('[Dashboard.js] WebSocket not open, retrying watchLogFile...'); 
                setTimeout(sendRequest, 200);
            }
        };
        sendRequest();
    }

    // Handle UI updates for waiting_for_input phase
    updateWaitingForInputUI(task) {
        console.log(`[Dashboard.js] Updating UI for 'waiting_for_input' phase. Task ID: ${task.taskId}, Current Step: ${task.currentStep}`); 
        // Update the running step indicator
        const runningStepElement = document.getElementById('running-step-name');
        if (runningStepElement) {
            runningStepElement.textContent = task.currentStep || 'unknown';
        }

        // Show/update the pending question card
        const pendingQuestionCard = document.getElementById('pending-question-card');
        if (task.pendingQuestion && !pendingQuestionCard) {
            // Reload to show the question card if it's not already visible
            console.log('Task is waiting for input but question card not visible. Reloading page.');
            window.location.reload();
        } else if (!task.pendingQuestion && pendingQuestionCard) {
            // Hide the question card if the question has been answered
            pendingQuestionCard.style.display = 'none';
        }

        // Update the status header to reflect waiting state
        const statusHeader = document.querySelector('.card-text');
        if (statusHeader && statusHeader.textContent.includes('RUNNING STEP:')) {
            statusHeader.innerHTML = `
                <strong>
                    <i class="bi bi-pause-circle-fill me-1"></i>
                    WAITING FOR INPUT: <span id="running-step-name">${task.currentStep || 'unknown'}</span>
                </strong>
            `;
            statusHeader.className = 'card-text text-warning mb-0';
        }
    }

    // ... (updateSequenceUI, handleLogUpdate, and updateStatusBadge remain the same)
    updateSequenceUI(sequence) {
        const sequenceStatusElement = document.querySelector(`[data-sequence-id="${sequence.sequenceId}"] .status-badge, #running-sequence-status`);
        if (sequenceStatusElement) {
            this.updateStatusBadge(sequenceStatusElement, sequence.phase);
        }

        if (window.location.pathname.endsWith('/live')) {
            if (['done', 'failed', 'interrupted'].includes(sequence.phase)) {
                setTimeout(() => window.location.href = '/history', 1500);
            }
        }
    }

    colorizeLogLine(line) {
        // This regex captures all the patterns we want to style, in a single pass.
        // Added Codex-oriented tokens: [FUNCTION_CALL], [FUNCTION_CALL_OUTPUT], [STDERR], [ERROR], [RESULT], [REASONING]
        const tokenizer = /(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]|\`.*?\`|(?<!\w)'.*?'|".*?"|\[ASSISTANT\]|\[USER\]|\[SYSTEM\]|\[TEXT\]|\[INIT\]|\[TOOL_USE\]|\[TOOL_RESULT\]|\[FUNCTION_CALL\]|\[FUNCTION_CALL_OUTPUT\]|\[STDERR\]|\[ERROR\]|\[RESULT\]|\[REASONING\])/g;

        const escapeHtml = (unsafe) =>
            unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

        // Split the string by our patterns. The captured delimiters are included in the array.
        const parts = line.split(tokenizer);

        const htmlParts = parts.map(part => {
            if (!part) return ''; // Ignore empty strings from the split.

            // Check if the part is one of our special tokens and apply the correct class.
            if (part.match(/^\[\d{4}/)) return `<span class="log-meta">${escapeHtml(part)}</span>`;
            if (part.startsWith('`') || part.startsWith('"') || part.startsWith("'")) return `<span class="log-quote">${escapeHtml(part)}</span>`;
            if (part === '[ASSISTANT]') return `<span class="log-assistant">${escapeHtml(part)}</span>`;
            if (part === '[USER]') return `<span class="log-user">${escapeHtml(part)}</span>`;
            if (part === '[SYSTEM]') return `<span class="log-system">${escapeHtml(part)}</span>`;
            if (part === '[TEXT]' || part === '[INIT]' || part === '[RESULT]' || part === '[REASONING]') return `<span class="log-info">${escapeHtml(part)}</span>`;
            if (part === '[TOOL_USE]' || part === '[TOOL_RESULT]' || part === '[FUNCTION_CALL]' || part === '[FUNCTION_CALL_OUTPUT]') return `<span class="log-tool">${escapeHtml(part)}</span>`;
            if (part === '[STDERR]' || part === '[ERROR]') return `<span class="log-error">${escapeHtml(part)}</span>`;

            // If it's not a special token, it's plain text. Escape it.
            return escapeHtml(part);
        });

        return `<div class="log-line">${htmlParts.join('')}</div>`;
    }

    handleLogUpdate(data) {
        if (!window.location.pathname.endsWith('/live')) return;
        const logContainer = document.getElementById('live-log-content');
        if (!logContainer) return;

        if (data.type === 'error') {
            logContainer.innerHTML += this.colorizeLogLine(`[SYSTEM] [ERROR] ${data.message}`);
        } else if (data.content) {
            // Process each line individually
            const lines = data.content.split('\n');
            const newHtml = lines.map(line => this.colorizeLogLine(line)).join('');

            if (data.type === 'log_content' || logContainer.textContent.startsWith('--- Switched to step')) {
                logContainer.innerHTML = newHtml;
            } else {
                logContainer.innerHTML += newHtml;
            }
        }

        if (logContainer.parentElement) {
            logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
        }
    }

    updateStatusBadge(element, phase) {
        if (!element) return;

        element.className = element.className.replace(/\bstatus-\S+/g, '');
        element.classList.add(`status-${phase}`);

        // Determine the appropriate icon for the phase
        let iconHtml = '';
        switch (phase) {
            case 'running':
                iconHtml = '<i class="bi bi-arrow-repeat spinner-border spinner-border-sm me-1" role="status"></i>';
                break;
            case 'waiting_for_input':
                iconHtml = '<i class="bi bi-question-circle-fill me-1"></i>';
                break;
            case 'done':
                iconHtml = '<i class="bi bi-check-circle-fill me-1"></i>';
                break;
            case 'failed':
                iconHtml = '<i class="bi bi-exclamation-triangle-fill me-1"></i>';
                break;
            case 'interrupted':
                iconHtml = '<i class="bi bi-pause-circle-fill me-1"></i>';
                break;
            default:
                // Try to preserve existing icon if phase is unknown
                const temp = document.createElement('span');
                temp.innerHTML = element.innerHTML;
                const existingIcon = temp.querySelector('i');
                iconHtml = existingIcon ? existingIcon.outerHTML : '';
        }

        element.innerHTML = `${iconHtml} ${phase}`;
    }
}

// --- Initialize Global Dashboard ---
window.dashboard = new CatHerderDashboard();
document.addEventListener('DOMContentLoaded', () => {
    if (window.dashboard) {
        window.dashboard.initWebSocket();
    }
});
