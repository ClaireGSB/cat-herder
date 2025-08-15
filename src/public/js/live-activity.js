function initializeLiveActivity() {
    const runningTask = window.liveActivityData?.runningTask || null;
    const logContainer = document.getElementById('live-log-content');
    
    // Store the original handler
    const originalOnMessage = window.dashboard.globalOnMessage;

    // Create a new, combined message handler
    window.dashboard.globalOnMessage = (data) => {
        // First, let the original handler do its work (for task_update, etc.)
        originalOnMessage(data);

        // Now, add the logic specific to this page
        if (data.type === 'log_content') {
            logContainer.textContent = data.content;
            autoScrollToBottom();
        } else if (data.type === 'log_update') {
            logContainer.textContent += data.content;
            autoScrollToBottom();
        } else if (data.type === 'error') {
            logContainer.textContent += `\n\n[WebSocket Error] ${data.message}`;
        } else if (data.type === 'journal_updated') {
            if (document.querySelector('.empty-state')) {
                window.location.reload();
            }
        }
    };

    if (!runningTask) {
        // No need for listenForNextTask anymore, the new handler covers it
        return;
    }
    
    // Request the initial log stream
    const currentStep = runningTask.currentStep;
    const reasoningLog = runningTask.logs?.[currentStep]?.reasoning;
    if (reasoningLog) {
        // We just need to request the stream, the handler is already set up
        const watchMessage = { type: 'watch_log', taskId: runningTask.taskId, logFile: reasoningLog };
        // Small delay to ensure websocket is connected
        setTimeout(() => {
             window.dashboard.websocket.send(JSON.stringify(watchMessage));
             logContainer.textContent = 'Connecting to log stream...\n';
        }, 200);
    } else {
         logContainer.textContent = `Error: Could not find reasoning log for step: ${currentStep}`;
    }
}


function autoScrollToBottom() {
    const logContainer = document.getElementById('live-log-content');
    if (logContainer) {
        logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
    }
}