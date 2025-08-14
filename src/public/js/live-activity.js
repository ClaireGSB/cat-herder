// Live Activity page initialization
function initializeLiveActivity() {
    // Get running task data from the server-rendered template
    const runningTaskData = window.liveActivityData?.runningTask || null;
    const parentSequenceData = window.liveActivityData?.parentSequence || null;
    
    if (runningTaskData && runningTaskData.taskId && runningTaskData.currentStep) {
        // Show task info
        document.getElementById('task-info-card').style.display = 'block';
        document.getElementById('no-running-task').style.display = 'none';
        document.getElementById('live-task-id').textContent = runningTaskData.taskId;
        document.getElementById('live-task-step').textContent = runningTaskData.currentStep;
        
        // Show sequence info if task is part of a sequence
        if (parentSequenceData && parentSequenceData.sequenceId) {
            document.getElementById('sequence-info-card').style.display = 'block';
            document.getElementById('live-sequence-id').textContent = parentSequenceData.sequenceId;
            document.getElementById('live-sequence-status').textContent = parentSequenceData.phase || 'unknown';
            
            // Update sequence status badge color
            const statusBadge = document.getElementById('live-sequence-status');
            statusBadge.className = 'badge bg-secondary';
            if (parentSequenceData.phase === 'running') {
                statusBadge.className = 'badge bg-primary';
            } else if (parentSequenceData.phase === 'done') {
                statusBadge.className = 'badge bg-success';
            } else if (parentSequenceData.phase === 'failed') {
                statusBadge.className = 'badge bg-danger';
            }
        } else {
            document.getElementById('sequence-info-card').style.display = 'none';
        }
        
        // Validate log data exists before attempting to connect
        const stepLog = runningTaskData.logs && runningTaskData.logs[runningTaskData.currentStep];
        if (!stepLog || !stepLog.reasoning) {
            const logContainer = document.getElementById('live-log-content');
            logContainer.textContent = 'No reasoning log available for current step: ' + runningTaskData.currentStep;
            return;
        }
        
        // Initialize WebSocket with live activity setup
        initLiveActivityWebSocket(runningTaskData, parentSequenceData, stepLog.reasoning);
    } else {
        // No running task, show message
        document.getElementById('task-info-card').style.display = 'none';
        document.getElementById('sequence-info-card').style.display = 'none';
        document.getElementById('no-running-task').style.display = 'block';
        document.getElementById('live-log-content').textContent = 'No active task to monitor.\n\nStart a task with:\nclaud-project run your-task.md\n\nThen refresh this page to see live logs.';
    }
}

// Initialize WebSocket specifically for live activity log streaming
function initLiveActivityWebSocket(runningTaskData, parentSequenceData, reasoningLogFile) {
    try {
        // Initialize the WebSocket connection
        window.dashboard.initWebSocket();
        
        // Wait for WebSocket to be ready, then set up live activity handlers
        const waitForConnection = () => {
            if (window.dashboard.websocket && window.dashboard.websocket.readyState === WebSocket.OPEN) {
                setupLiveActivityHandlers(runningTaskData, parentSequenceData, reasoningLogFile);
            } else if (window.dashboard.websocket && window.dashboard.websocket.readyState === WebSocket.CONNECTING) {
                // Wait for connection to open
                window.dashboard.websocket.addEventListener('open', () => {
                    setupLiveActivityHandlers(runningTaskData, parentSequenceData, reasoningLogFile);
                });
            } else {
                // Retry after a short delay
                setTimeout(waitForConnection, 100);
            }
        };
        
        waitForConnection();
        
    } catch (error) {
        console.error('Failed to initialize WebSocket for live activity:', error);
        const logContainer = document.getElementById('live-log-content');
        logContainer.textContent = 'Failed to connect to live log stream: ' + error.message;
    }
}

// Set up WebSocket message handlers for live activity
function setupLiveActivityHandlers(runningTaskData, parentSequenceData, reasoningLogFile) {
    const logContainer = document.getElementById('live-log-content');
    
    // Override the WebSocket message handler for live activity
    window.dashboard.websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'log_content') {
                // Initial log content
                logContainer.textContent = data.content;
                autoScrollToBottom();
            } else if (data.type === 'log_update') {
                // New log content
                logContainer.textContent += data.content;
                autoScrollToBottom();
            } else if (data.type === 'task_update' && data.data.taskId === runningTaskData.taskId) {
                // Handle task status updates
                if (data.data.phase !== 'running') {
                    logContainer.textContent += `\n\n--- TASK FINISHED with status: ${data.data.phase} ---`;
                    autoScrollToBottom();
                    
                    // Show task finished banner if no sequence is involved
                    if (!parentSequenceData) {
                        const taskBanner = document.getElementById('task-finished-banner');
                        const taskDetailsLink = document.getElementById('view-task-details-link');
                        taskDetailsLink.href = `/task/${runningTaskData.taskId}`;
                        taskBanner.style.display = 'block';
                    }
                }
                
                // Update current step if provided
                if (data.data.currentStep) {
                    document.getElementById('live-task-step').textContent = data.data.currentStep;
                }
            } else if (parentSequenceData && data.type === 'sequence_update' && data.data.sequenceId === parentSequenceData.sequenceId) {
                // Handle sequence status updates
                const sequenceStatusBadge = document.getElementById('live-sequence-status');
                if (sequenceStatusBadge) {
                    sequenceStatusBadge.textContent = data.data.phase || 'unknown';
                    
                    // Update badge color
                    sequenceStatusBadge.className = 'badge bg-secondary';
                    if (data.data.phase === 'running') {
                        sequenceStatusBadge.className = 'badge bg-primary';
                    } else if (data.data.phase === 'done') {
                        sequenceStatusBadge.className = 'badge bg-success';
                    } else if (data.data.phase === 'failed') {
                        sequenceStatusBadge.className = 'badge bg-danger';
                    }
                }
                
                // Handle sequence completion
                if (data.data.phase !== 'running') {
                    logContainer.textContent += `\n\n--- SEQUENCE FINISHED with status: ${data.data.phase} ---`;
                    autoScrollToBottom();
                    
                    // Show sequence finished banner and hide task banner
                    const seqBanner = document.getElementById('sequence-finished-banner');
                    const seqDetailsLink = document.getElementById('view-sequence-details-link');
                    seqDetailsLink.href = `/sequence/${parentSequenceData.sequenceId}`;
                    seqBanner.style.display = 'block';
                    
                    // Hide the individual task finished banner
                    document.getElementById('task-finished-banner').style.display = 'none';
                }
            } else if (data.type === 'error') {
                console.error('WebSocket error:', data.message);
                logContainer.textContent += '\n[ERROR: ' + data.message + ']\n';
                autoScrollToBottom();
            }
        } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
            logContainer.textContent += '\n[ERROR: Failed to parse message]\n';
            autoScrollToBottom();
        }
    };
    
    // Request to start watching the log file
    const watchMessage = {
        type: 'watch_log',
        taskId: runningTaskData.taskId,
        logFile: reasoningLogFile
    };
    
    window.dashboard.websocket.send(JSON.stringify(watchMessage));
    console.log('Watching log file:', reasoningLogFile, 'for task:', runningTaskData.taskId);
}

// Helper function to auto-scroll to bottom of log content
function autoScrollToBottom() {
    const logContainer = document.getElementById('live-log-content');
    if (logContainer && logContainer.parentElement) {
        logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
    }
}