function initializeLiveActivity() {
    const runningTask = window.liveActivityData?.runningTask || null;
    const logContainer = document.getElementById('live-log-content');

    if (!runningTask) {
        // The EJS template already shows the "No task running" message.
        // We just need to listen for a new task starting.
        listenForNextTask(null);
        return;
    }

    // A task is running, so let's set up the log stream for it.
    const currentStep = runningTask.currentStep;
    const reasoningLog = runningTask.logs?.[currentStep]?.reasoning;

    if (!reasoningLog) {
        logContainer.textContent = `Error: Could not find reasoning log for step: ${currentStep}`;
        return;
    }

    // Set up WebSocket to stream the log file
    setupLogStream(runningTask.taskId, reasoningLog);

    // Start listening for state changes (e.g., this task finishing or a new one starting)
    listenForNextTask(runningTask.taskId);
}

function setupLogStream(taskId, logFile) {
    const logContainer = document.getElementById('live-log-content');
    
    // Ensure we have a WebSocket connection
    if (!window.dashboard.websocket || window.dashboard.websocket.readyState !== WebSocket.OPEN) {
        // If not connected, wait a moment and retry. `initWebSocket` is called on page load.
        setTimeout(() => setupLogStream(taskId, logFile), 200);
        return;
    }

    // Override the default onmessage handler for this page
    window.dashboard.websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'log_content') {
                logContainer.textContent = data.content;
                autoScrollToBottom();
            } else if (data.type === 'log_update') {
                logContainer.textContent += data.content;
                autoScrollToBottom();
            } else if (data.type === 'error') {
                logContainer.textContent += `\n\n[WebSocket Error] ${data.message}`;
                autoScrollToBottom();
            }
        } catch (e) {
            console.error('Error processing WebSocket message:', e);
        }
    };
    
    // Tell the server we want to watch this specific log file
    const watchMessage = { type: 'watch_log', taskId: taskId, logFile: logFile };
    window.dashboard.websocket.send(JSON.stringify(watchMessage));
    logContainer.textContent = 'Connecting to log stream...\n';
}

function listenForNextTask(currentTaskId) {
    // We use the *main* dashboard handler here, not the log streamer,
    // because we care about high-level state changes.
    window.dashboard.handleRealtimeUpdate = (message) => {
        if (message.type === 'task_update') {
            const updatedTask = message.data;

            // Scenario 1: A new task has started. Reload to track it.
            if (updatedTask.phase === 'running' && updatedTask.taskId !== currentTaskId) {
                window.location.reload();
            }
            // Scenario 2: The task we were watching has stopped. Reload to see what's next.
            else if (updatedTask.phase !== 'running' && updatedTask.taskId === currentTaskId) {
                window.location.reload();
            }
        } else if (message.type === 'sequence_update') {
            const updatedSequence = message.data;
            // Scenario 3: The sequence has finished. Go to the history page.
            if (updatedSequence.phase === 'done' || updatedSequence.phase === 'failed') {
                // Add a small delay to ensure logs are flushed
                setTimeout(() => {
                    window.location.href = `/history`;
                }, 1000);
            }
        }
    };
}

function autoScrollToBottom() {
    const logContainer = document.getElementById('live-log-content');
    if (logContainer) {
        logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
    }
}