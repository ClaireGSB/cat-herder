class ClaudeDashboard {
    constructor() {
        this.websocket = null;
        this.reconnectInterval = 5000;
    }

    initWebSocket() {
        if (typeof WebSocket === 'undefined') return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => console.log('WebSocket connected');
        this.websocket.onmessage = (event) => {
            try {
                this.handleRealtimeUpdate(JSON.parse(event.data));
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };
        this.websocket.onclose = () => setTimeout(() => this.initWebSocket(), this.reconnectInterval);
        this.websocket.onerror = (error) => console.error('WebSocket error:', error);
    }

    handleRealtimeUpdate(data) {
        console.log('Received real-time update:', data);

        switch (data.type) {
            case 'task_update':
                this.updateTaskUI(data.data);
                break;
            case 'sequence_update':
                this.updateSequenceUI(data.data);
                break;
            case 'journal_updated':
                if (document.querySelector('.empty-state')) window.location.reload();
                break;
            case 'log_content':
            case 'log_update':
            case 'error':
                this.handleLogUpdate(data);
                break;
        }
    }

    updateTaskUI(task) {
        // --- Universal Task Row Update (History, Sequence Detail) ---
        const taskRow = document.querySelector(`[data-task-id="${task.taskId}"]`);
        if (taskRow) {
            this.updateStatusBadge(taskRow.querySelector('.task-status-badge'), task.phase);
            // Add other row updates if needed (e.g., duration)
        }

        // --- Live Activity Header Update ---
        if (window.location.pathname.endsWith('/live')) {
            const runningTask = window.liveActivityData?.runningTask;
            if (runningTask && runningTask.taskId === task.taskId) {
                document.querySelector('#running-step-name')?.textContent = task.currentStep;
                
                // If the active task is no longer running, reload to show "Last Finished" view
                if (task.phase !== 'running') {
                    setTimeout(() => window.location.reload(), 1200);
                }
            }
        }
    }

    updateSequenceUI(sequence) {
        // --- Universal Sequence Row/Header Update (History, Sequence Detail, Live Activity) ---
        const sequenceStatusElement = document.querySelector(`[data-sequence-id="${sequence.sequenceId}"] .status-badge, #running-sequence-status`);
        if (sequenceStatusElement) {
            this.updateStatusBadge(sequenceStatusElement, sequence.phase);
        }

        // --- Live Activity Page Logic ---
        if (window.location.pathname.endsWith('/live')) {
            // If the sequence finishes, redirect to history to see the results
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
        logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
    }

    updateStatusBadge(element, phase) {
        if (!element) return;
        
        // Remove all existing status-* classes
        element.className = element.className.replace(/\bstatus-\S+/g, '');
        element.classList.add(`status-${phase}`);

        // Create a temporary span to parse existing HTML, preserving icons
        const temp = document.createElement('span');
        temp.innerHTML = element.innerHTML;
        const icon = temp.querySelector('i');
        
        element.innerHTML = `${icon ? icon.outerHTML : ''} ${phase}`;
    }
}

// --- Initialize Global Dashboard ---
window.dashboard = new ClaudeDashboard();
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard.initWebSocket();
});