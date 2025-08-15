# Plan.md

## The Problem in the Current Code

1.  **Incorrect Page Logic:** In `dashboard.js`, the `updateTaskState` function has checks like `if (window.location.pathname === '/')`. This is too restrictive and will fail on pages like `/live`.
2.  **No Logic for `history.ejs`:** There's no specific handler to update the `history` page, which is why the sequence status appears stale.
3.  **Redundant Code:** There are multiple functions trying to update different parts of the UI (`updateDashboardRow`, `updateTaskDetail`, `updateLiveActivityHeader`, etc.), which makes the code hard to follow and maintain.

## The Solution: A Single, Robust Update Function

We will replace the fragmented update logic with a single, powerful function in `dashboard.js` that can intelligently update *any* part of the UI based on the incoming data. This is a much more robust pattern.

## implemention checklist

- [x] Step 1: Replace the existing `dashboard.js` with a new version that centralizes update logic.
- [ ] Step 2: Ensure `live-activity.js` is Correct


---

### Step 1: Replace `dashboard.js` with the Corrected Version

Delete the entire contents of `src/public/js/dashboard.js` and replace it with this corrected and simplified code. This new version centralizes all the update logic and correctly targets elements on all pages.

**File:** `src/public/js/dashboard.js`

```javascript
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
```

### Step 2: Ensure `live-activity.js` is Correct

Your `live-activity.js` from the previous step is correct. Its only job is to request the log stream. Let's just confirm it looks like this:

**File:** `src/public/js/live-activity.js`

```javascript
function initializeLiveActivity() {
    const runningTask = window.liveActivityData?.runningTask || null;
    if (!runningTask) return;

    const logContainer = document.getElementById('live-log-content');
    const currentStep = runningTask.currentStep;
    const reasoningLog = runningTask.logs?.[currentStep]?.reasoning;

    if (!reasoningLog) {
        if (logContainer) logContainer.textContent = `Error: Could not find reasoning log for step: ${currentStep}`;
        return;
    }

    const sendWatchRequest = () => {
        if (window.dashboard.websocket && window.dashboard.websocket.readyState === WebSocket.OPEN) {
            const watchMessage = { type: 'watch_log', taskId: runningTask.taskId, logFile: reasoningLog };
            window.dashboard.websocket.send(JSON.stringify(watchMessage));
            if (logContainer) logContainer.textContent = 'Connecting to log stream...\n';
        } else {
            setTimeout(sendWatchRequest, 200);
        }
    };

    sendWatchRequest();
}

document.addEventListener('DOMContentLoaded', initializeLiveActivity);
```