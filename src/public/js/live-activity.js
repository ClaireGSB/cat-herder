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