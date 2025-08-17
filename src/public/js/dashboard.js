class ClaudeDashboard {
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
        const taskRow = document.querySelector(`[data-task-id="${task.taskId}"]`);
        if (taskRow) {
            this.updateStatusBadge(taskRow.querySelector('.task-status-badge'), task.phase);
        }

        if (window.location.pathname.endsWith('/live')) {
            const runningTask = window.liveActivityData?.runningTask;
            // If there's no running task defined on the page, or if the incoming update
            // is for a DIFFERENT task (e.g., the one that just finished), ignore it.
            // This prevents the race condition during task transitions.
            if (!runningTask || runningTask.taskId !== task.taskId) {
                return;
            }
            // Update the header text
            const stepNameElement = document.querySelector('#running-step-name');
            if (stepNameElement) {
                stepNameElement.textContent = task.currentStep;
            }

            // --- NEW: Logic to switch the log file watch ---
            const newStep = task.currentStep;
            // Default to watching the 'reasoning' log as it's the most informative.
            const newLogFile = task.logs?.[newStep]?.reasoning;

            if (newLogFile && this.currentWatchedLogFile !== newLogFile) {
                console.log(`Step changed. Switching log watch from ${this.currentWatchedLogFile} to ${newLogFile}`);
                this.currentWatchedLogFile = newLogFile;
                this.watchLogFile(task.taskId, newLogFile);
            }
            // --- END NEW LOGIC ---

            if (task.phase !== 'running') {
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

    handleLogUpdate(data) {
        if (!window.location.pathname.endsWith('/live')) return;
        const logContainer = document.getElementById('live-log-content');
        if (!logContainer) return;

        if (data.type === 'log_content') {
            logContainer.textContent = data.content;
        } else if (data.type === 'log_update') {
            // Clear the "Connecting..." message on first update
            if (logContainer.textContent.startsWith('--- Switched to step')) {
                logContainer.textContent = data.content;
            } else {
                logContainer.textContent += data.content;
            }
        } else if (data.type === 'error') {
            logContainer.textContent += `\n\n[WebSocket Error] ${data.message}`;
        }
        if (logContainer.parentElement) {
            logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
        }
    }

    updateStatusBadge(element, phase) {
        if (!element) return;

        element.className = element.className.replace(/\bstatus-\S+/g, '');
        element.classList.add(`status-${phase}`);

        const temp = document.createElement('span');
        temp.innerHTML = element.innerHTML;
        const icon = temp.querySelector('i');

        element.innerHTML = `${icon ? icon.outerHTML : ''} ${phase}`;
    }
}

// --- Initialize Global Dashboard ---
window.dashboard = new ClaudeDashboard();
document.addEventListener('DOMContentLoaded', () => {
    if (window.dashboard) {
        window.dashboard.initWebSocket();
    }
});