class ClaudeDashboard {
    constructor() {
        this.websocket = null;
        this.reconnectInterval = 5000;
    }

    initWebSocket() {
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

    updateTaskUI(task) {
        const taskRow = document.querySelector(`[data-task-id="${task.taskId}"]`);
        if (taskRow) {
            this.updateStatusBadge(taskRow.querySelector('.task-status-badge'), task.phase);
        }

        if (window.location.pathname.endsWith('/live')) {
            const runningTask = window.liveActivityData?.runningTask;
            if (runningTask && runningTask.taskId === task.taskId) {
                
                // --- THIS IS THE CORRECTED CODE ---
                const stepNameElement = document.querySelector('#running-step-name');
                if (stepNameElement) {
                    stepNameElement.textContent = task.currentStep;
                }
                // --- END CORRECTION ---
                
                if (task.phase !== 'running') {
                    setTimeout(() => window.location.reload(), 1200);
                }
            }
        }
    }

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
            logContainer.textContent += data.content;
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