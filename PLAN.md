
# PLAN: Implement Real-Time Log Streaming and Step Updates

## Goal
We have a very subtle but common bug in real-time web applications. Your analysis is perfectly correct: the UI is not updating when new tasks start or when the sequence status changes. This is a flaw in how the frontend JavaScript was implemented to handle different types of real-time messages.


### Diagnosis: The Root Cause

The issue is in how the client-side JavaScript handles WebSocket messages. The current implementation in `src/public/js/live-activity.js` **replaces** the main message handler with a new one that *only* knows how to process log updates (`log_content`, `log_update`, etc.).

When this happens, the page loses the ability to process other crucial messages like `task_update` (which announces a new step is running) and `sequence_update` (which announces a status change like "running" instead of "waiting for reset").

The result is exactly what you see: the log stream connects, but the rest of the UI is frozen in time, completely unaware of any state changes happening on the server.

### The Solution: A Centralized Message Handler

The correct approach is to have a single, robust message handler in `dashboard.js` that knows how to deal with *all* message types. The `live-activity.js` script should only be responsible for *requesting* the log stream, not for processing the messages itself.

Here is the corrected code. It's a cleaner architecture that will solve all the issues you're seeing.


## Summary Checklist

-   [x] **1. Update the EJS template** to add IDs for easier DOM manipulation.
-   [ ] **2. Centralize all WebSocket message handling** in `dashboard.js` to ensure all message types are processed correctly.
-   [ ] **3. Simplify `live-activity.js`** to only handle the initial log request.

---

## Detailed Implementation Steps

---

### Step 1: Update the EJS Template for Better Targeting

First, let's add some `id` attributes to your `live-activity.ejs` template so our JavaScript can reliably update the correct elements.

**File:** `src/templates/web/live-activity.ejs`

```html
<!-- ... inside the <% if (runningTask) { %> block ... -->
<h6 class="card-subtitle mb-2 text-muted">
    <i class="bi bi-collection me-1"></i>
    SEQUENCE: <%= parentSequence.sequenceId %> <span id="running-sequence-status">(<%= parentSequence.phase %>)</span>
</h6>
<h5 class="card-title mb-1">
    <i class="bi bi-gear-fill me-1"></i>
    TASK: <span id="running-task-id"><%= runningTask.taskId %></span>
</h5>
<p class="card-text text-primary mb-0">
    <strong>
        <i class="bi bi-arrow-repeat spinner-border spinner-border-sm me-1" role="status"></i>
        RUNNING STEP: <span id="running-step-name"><%= runningTask.currentStep %></span>
    </strong>
</p>
<!-- ... -->
```

### Step 2: Centralize All Logic in `dashboard.js`

Next, replace the entire contents of `src/public/js/dashboard.js` with this improved version. It centralizes all WebSocket message handling and adds the logic to update the live activity page elements.

**File:** `src/public/js/dashboard.js`

```javascript
class ClaudeDashboard {
    constructor() {
        this.websocket = null;
        this.reconnectInterval = 5000;
        this.maxReconnectAttempts = 5;
        this.reconnectAttempts = 0;
    }

    initWebSocket() {
        if (typeof WebSocket === 'undefined') return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
        };

        this.websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleRealtimeUpdate(data); // Central dispatcher
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };

        this.websocket.onclose = () => this.attemptReconnect();
        this.websocket.onerror = (error) => console.error('WebSocket error:', error);
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.initWebSocket(), this.reconnectInterval);
        }
    }

    handleRealtimeUpdate(data) {
        console.log('Received real-time update:', data);

        // --- Global Handlers ---
        if (data.type === 'task_update') this.updateTaskState(data.data);
        if (data.type === 'sequence_update') this.updateSequenceState(data.data);
        if (data.type === 'journal_updated') {
             if (document.querySelector('.empty-state')) window.location.reload();
        }

        // --- Page-Specific Handlers ---
        if (window.location.pathname.endsWith('/live')) {
            this.handleLiveActivityUpdates(data);
        }
    }

    // --- State Update Logic ---
    updateTaskState(task) {
        // For /history page
        this.updateHistoryTaskRow(task);
        // For /sequence/... detail page
        this.updateTaskInSequenceDetail(task);
    }
    
    updateSequenceState(sequence) {
         // For /history page
        this.updateHistorySequenceRow(sequence);
    }

    // --- Live Activity Page Specific Logic ---
    handleLiveActivityUpdates(data) {
        const logContainer = document.getElementById('live-log-content');
        if (!logContainer) return;

        if (data.type === 'log_content') {
            logContainer.textContent = data.content;
            this.autoScroll(logContainer);
        } else if (data.type === 'log_update') {
            logContainer.textContent += data.content;
            this.autoScroll(logContainer);
        } else if (data.type === 'error') {
            logContainer.textContent += `\n\n[WebSocket Error] ${data.message}`;
            this.autoScroll(logContainer);
        } else if (data.type === 'task_update') {
            this.updateLiveActivityHeader(data.data);
            const runningTask = window.liveActivityData?.runningTask;
            if (runningTask && runningTask.taskId === data.data.taskId && data.data.phase !== 'running') {
                setTimeout(() => window.location.reload(), 1000);
            }
        } else if (data.type === 'sequence_update') {
            this.updateLiveActivityHeader(null, data.data);
            if (['done', 'failed', 'interrupted'].includes(data.data.phase)) {
                 setTimeout(() => window.location.href = `/history`, 1500);
            }
        }
    }

    updateLiveActivityHeader(taskData, sequenceData) {
        if (taskData) {
            document.querySelector('#running-task-id')?.textContent = taskData.taskId;
            document.querySelector('#running-step-name')?.textContent = taskData.currentStep;
        }
        if (sequenceData) {
            document.querySelector('#running-sequence-status')?.textContent = `(${sequenceData.phase})`;
        }
    }

    autoScroll(logContainer) {
        if (logContainer) {
            logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
        }
    }
    
    // --- History & Detail Page DOM Updaters ---
    updateHistoryTaskRow(task) { /* ... keep existing logic if any ... */ }
    updateHistorySequenceRow(sequence) { /* ... keep existing logic if any ... */ }
    updateTaskInSequenceDetail(task) { /* ... keep existing logic if any ... */ }
}

// --- Initialize Global Dashboard ---
window.dashboard = new ClaudeDashboard();
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard.initWebSocket();
});
```

### Step 3: Drastically Simplify `live-activity.js`

Finally, replace the entire contents of `src/public/js/live-activity.js` with this much simpler version. Its only job is now to ask the server to start streaming logs.

**File:** `src/public/js/live-activity.js`

```javascript
function initializeLiveActivity() {
    const runningTask = window.liveActivityData?.runningTask || null;
    if (!runningTask) {
        // Nothing to do. The main handler in dashboard.js will listen for 'journal_updated'.
        return;
    }

    const logContainer = document.getElementById('live-log-content');
    const currentStep = runningTask.currentStep;
    const reasoningLog = runningTask.logs?.[currentStep]?.reasoning;

    if (!reasoningLog) {
        if (logContainer) logContainer.textContent = `Error: Could not find reasoning log for step: ${currentStep}`;
        return;
    }

    // This function repeatedly tries to send the watch request until the WebSocket is ready.
    const sendWatchRequest = () => {
        if (window.dashboard.websocket && window.dashboard.websocket.readyState === WebSocket.OPEN) {
            const watchMessage = { type: 'watch_log', taskId: runningTask.taskId, logFile: reasoningLog };
            window.dashboard.websocket.send(JSON.stringify(watchMessage));
            if (logContainer) logContainer.textContent = 'Connecting to log stream...\n';
        } else {
            // If the socket isn't open yet, wait and try again.
            setTimeout(sendWatchRequest, 200);
        }
    };

    sendWatchRequest();
}

// Hook into the main dashboard initializer
document.addEventListener('DOMContentLoaded', initializeLiveActivity);

```