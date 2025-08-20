class CatHerderDashboard {
    constructor() {
        this.websocket = null;
        this.reconnectInterval = 5000;
        // --- NEW: Keep track of the log file we are currently watching ---
        this.currentWatchedLogFile = null;
    }

    initWebSocket() {
        // ... (The initWebSocket function remains exactly the same)
        if (typeof WebSocket === 'undefined') {
            console.error("WebSockets are not supported in this browser.");
            return;
        }
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => console.log('WebSocket connected. Listening for updates...');

        this.websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message received on client:', data); // Debug log
                this.handleRealtimeUpdate(data);
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e, 'Raw data:', event.data);
            }
        };

        this.websocket.onclose = () => {
            console.log('WebSocket disconnected. Attempting to reconnect in 5 seconds...');
            setTimeout(() => this.initWebSocket(), this.reconnectInterval);
        };

        this.websocket.onerror = (error) => console.error('WebSocket error:', error);
    }

    handleRealtimeUpdate(data) {
        // ... (The handleRealtimeUpdate switch statement remains the same)
        switch (data.type) {
            case 'task_update':
                this.updateTaskUI(data.data);
                break;
            case 'sequence_update':
                this.updateSequenceUI(data.data);
                break;
            case 'journal_updated':
                console.log('\'journal_updated\' event handled. Current path:', window.location.pathname);
                if (window.location.pathname.endsWith('/live') || window.location.pathname === '/') {
                    console.log('Path is /live or /, attempting page reload...');
                    window.location.reload();
                }
                break;
            case 'log_content':
            case 'log_update':
            case 'error':
                this.handleLogUpdate(data);
                break;
        }
    }

    // --- NEW: A dedicated function to start the live view ---
    initializeLiveView(runningTask) {
        if (!runningTask) {
            console.log("Live view initialized, no task is currently running.");
            return;
        }
        // Trigger the first UI update and log watch.
        this.updateTaskUI(runningTask);
    }

    updateTaskUI(task) {
        // This part updates the history page badge in real-time
        const taskRow = document.querySelector(`[data-task-id="${task.taskId}"]`);
        if (taskRow) {
            this.updateStatusBadge(taskRow.querySelector('.task-status-badge'), task.phase);
        }

        if (window.location.pathname.endsWith('/live')) {
            const runningTask = window.liveActivityData?.runningTask;
            if (!runningTask) return;
            
            // --- NEW RELOAD LOGIC ---
            // If the incoming update is for the currently running task,
            // check if the step has changed. If so, reload the page
            // to update the entire sidebar and status headers.
            if (runningTask.taskId === task.taskId && runningTask.currentStep !== task.currentStep) {
                console.log(`Step changed from '${runningTask.currentStep}' to '${task.currentStep}'. Reloading.`);
                window.location.reload();
                return; // Stop further processing
            }
            // --- END NEW LOGIC ---


            // This part handles the log switching when a step changes,
            // which will now run after a page reload.
            const newStep = task.currentStep;
            const newLogFile = task.logs?.[newStep]?.reasoning;

            if (newLogFile && this.currentWatchedLogFile !== newLogFile) {
                console.log(`Switching log watch to ${newLogFile}`);
                this.currentWatchedLogFile = newLogFile;
                this.watchLogFile(task.taskId, newLogFile);
            }

            // Update status indicators for waiting_for_input phase
            if (task.phase === 'waiting_for_input') {
                this.updateWaitingForInputUI(task);
            }

            // Existing logic to reload when the task is finished
            if (window.liveActivityData.isLive && task.phase !== 'running' && task.phase !== 'waiting_for_input') {
                console.log(`Task phase changed from 'running' to '${task.phase}'. Reloading to show final state.`);
                setTimeout(() => window.location.reload(), 1200);
            }
        }
    }

    // --- NEW: A reusable function to send the watch_log message ---
    watchLogFile(taskId, logFile) {
        const sendRequest = () => {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                const watchMessage = { type: 'watch_log', taskId: taskId, logFile: logFile };
                this.websocket.send(JSON.stringify(watchMessage));

                const logContainer = document.getElementById('live-log-content');
                if (logContainer) {
                    logContainer.textContent = `--- Switched to step: ${taskId} ---\nConnecting to log stream for ${logFile}...\n`;
                }
            } else {
                // If the socket isn't open yet, wait and try again.
                setTimeout(sendRequest, 200);
            }
        };
        sendRequest();
    }

    // Handle UI updates for waiting_for_input phase
    updateWaitingForInputUI(task) {
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
        const tokenizer = /(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]|\`.*?\`|(?<!\w)'.*?'|".*?"|\[ASSISTANT\]|\[USER\]|\[SYSTEM\]|\[TEXT\]|\[INIT\]|\[TOOL_USE\]|\[TOOL_RESULT\])/g;
      
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
            if (part === '[TEXT]' || part === '[INIT]') return `<span class="log-info">${escapeHtml(part)}</span>`;
            if (part === '[TOOL_USE]' || part === '[TOOL_RESULT]') return `<span class="log-tool">${escapeHtml(part)}</span>`;
            
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
                logContainer.innerHTML = newHtml; // Replace content
            } else {
                logContainer.innerHTML += newHtml; // Append content
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