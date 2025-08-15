// Utility functions for the dashboard
class ClaudeDashboard {
    constructor() {
        this.websocket = null;
        this.reconnectInterval = 5000;
        this.maxReconnectAttempts = 5;
        this.reconnectAttempts = 0;
        this.globalOnMessage = this.handleRealtimeUpdate.bind(this);
    }
    
    // Initialize WebSocket connection (for future real-time updates)
    initWebSocket() {
        if (typeof WebSocket === 'undefined') {
            console.warn('WebSocket not supported in this browser');
            return;
        }
        
        try {
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
                    // Call the globally accessible handler
                    this.globalOnMessage(data);
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            };
            
            this.websocket.onclose = () => {
                console.log('WebSocket disconnected');
                this.attemptReconnect();
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to initialize WebSocket:', error);
        }
    }
    
    // Attempt to reconnect WebSocket
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.initWebSocket(), this.reconnectInterval);
        }
    }
    
    // Handle real-time updates from WebSocket
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
        if (window.location.pathname === '/') {
            this.updateDashboardRow(task);
        }
        // For /task/... detail page
        if (window.location.pathname.startsWith('/task/')) {
            this.updateTaskDetail(task);
        }
        // For /sequence/... detail page
        this.updateTaskInSequenceDetail(task);
    }
    
    updateSequenceState(sequence) {
         // For /sequences page
        if (window.location.pathname === '/sequences') {
            this.updateSequencesDashboardRow(sequence);
        }
        // For /sequence/... detail page
        if (window.location.pathname.startsWith('/sequence/')) {
            this.updateSequenceDetail(sequence);
        }
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
            const taskIdElement = document.querySelector('#running-task-id');
            const stepNameElement = document.querySelector('#running-step-name');
            if (taskIdElement) taskIdElement.textContent = taskData.taskId;
            if (stepNameElement) stepNameElement.textContent = taskData.currentStep;
        }
        if (sequenceData) {
            const sequenceStatusElement = document.querySelector('#running-sequence-status');
            if (sequenceStatusElement) sequenceStatusElement.textContent = `(${sequenceData.phase})`;
        }
    }

    autoScroll(logContainer) {
        if (logContainer) {
            logContainer.parentElement.scrollTop = logContainer.parentElement.scrollHeight;
        }
    }
    
    // Update a specific row in the dashboard table
    updateDashboardRow(taskData) {
        const row = document.querySelector(`tr[data-task-id="${taskData.taskId}"]`);
        if (row) {
            // Update status badge
            const statusBadge = row.querySelector('.status-badge');
            if (statusBadge) {
                statusBadge.className = `badge status-${taskData.phase} status-badge`;
                statusBadge.textContent = taskData.phase;
            }
            
            // Update duration
            const durationCell = row.querySelector('.duration-cell');
            if (durationCell && taskData.stats?.totalDuration) {
                durationCell.textContent = `${taskData.stats.totalDuration.toFixed(2)}s`;
            }
            
            // Update last update time
            const updateCell = row.querySelector('.update-cell');
            if (updateCell) {
                updateCell.textContent = new Date(taskData.lastUpdate || Date.now()).toLocaleString();
            }
        }
    }
    
    // Update task detail page
    updateTaskDetail(taskData) {
        // Update status in header
        const statusElement = document.querySelector('.task-status');
        if (statusElement && taskData.phase) {
            statusElement.className = `badge status-${taskData.phase} task-status`;
            statusElement.textContent = taskData.phase;
        }
        
        // Update stats
        if (taskData.stats) {
            const durationElement = document.querySelector('.task-duration');
            if (durationElement) {
                durationElement.textContent = `${taskData.stats.totalDuration?.toFixed(2) || 'N/A'}s`;
            }
        }
    }
    
    
    // Update a specific row in the sequences dashboard table
    updateSequencesDashboardRow(sequenceData) {
        const row = document.querySelector(`tr[data-sequence-id="${sequenceData.sequenceId}"]`);
        if (row) {
            // Update status badge
            const statusBadge = row.querySelector('.status-badge');
            if (statusBadge) {
                statusBadge.className = `badge status-${sequenceData.phase} status-badge`;
                
                // Update icon
                let iconHtml = '';
                if (sequenceData.phase === 'running') {
                    iconHtml = '<i class="bi bi-arrow-repeat spinner-border spinner-border-sm me-1" role="status"></i>';
                } else if (sequenceData.phase === 'done') {
                    iconHtml = '<i class="bi bi-check-circle-fill me-1"></i>';
                } else if (sequenceData.phase === 'failed') {
                    iconHtml = '<i class="bi bi-exclamation-triangle-fill me-1"></i>';
                } else if (sequenceData.phase === 'paused') {
                    iconHtml = '<i class="bi bi-pause-circle-fill me-1"></i>';
                }
                statusBadge.innerHTML = iconHtml + sequenceData.phase;
            }
            
            // Update duration
            const durationCell = row.querySelector('.duration-cell');
            if (durationCell && sequenceData.stats?.totalDuration) {
                durationCell.innerHTML = `${sequenceData.stats.totalDuration.toFixed(2)}s`;
                if (sequenceData.stats.totalPauseTime && sequenceData.stats.totalPauseTime > 0) {
                    durationCell.innerHTML += `<br><small class="text-warning"><i class="bi bi-pause-fill"></i> ${sequenceData.stats.totalPauseTime.toFixed(2)}s paused</small>`;
                }
            }
            
            // Update last update time
            const updateCell = row.querySelector('.update-cell');
            if (updateCell) {
                updateCell.textContent = new Date(sequenceData.lastUpdate || Date.now()).toLocaleString();
            }
        }
        
        // Update summary cards at top of page
        this.updateSequenceSummaryCards(sequenceData.phase);
    }
    
    // Update sequence detail page
    updateSequenceDetail(sequenceData) {
        // Update status in header
        const statusElement = document.querySelector('.sequence-status');
        if (statusElement && sequenceData.phase) {
            statusElement.className = `badge status-${sequenceData.phase} fs-6 sequence-status`;
            
            // Update icon
            let iconHtml = '';
            if (sequenceData.phase === 'running') {
                iconHtml = '<i class="bi bi-arrow-repeat spinner-border spinner-border-sm me-1" role="status"></i>';
            } else if (sequenceData.phase === 'done') {
                iconHtml = '<i class="bi bi-check-circle-fill me-1"></i>';
            } else if (sequenceData.phase === 'failed') {
                iconHtml = '<i class="bi bi-exclamation-triangle-fill me-1"></i>';
            } else if (sequenceData.phase === 'paused') {
                iconHtml = '<i class="bi bi-pause-circle-fill me-1"></i>';
            }
            statusElement.innerHTML = iconHtml + sequenceData.phase;
        }
        
        // Update stats
        if (sequenceData.stats) {
            const durationElement = document.querySelector('.sequence-duration');
            if (durationElement) {
                durationElement.textContent = `${sequenceData.stats.totalDuration?.toFixed(2) || 'N/A'}s`;
            }
        }
        
        // Refresh task completion counts if available
        this.refreshSequenceTaskCounts();
    }
    
    // Update individual task status within sequence detail page
    updateTaskInSequenceDetail(taskData) {
        const taskElement = document.querySelector(`[data-task-id="${taskData.taskId}"]`);
        if (taskElement) {
            // Update task status badge
            const statusBadge = taskElement.querySelector('.task-status-badge');
            if (statusBadge) {
                statusBadge.className = `badge status-${taskData.phase} ms-2 task-status-badge`;
                
                // Update icon and text
                let iconHtml = '';
                if (taskData.phase === 'running') {
                    iconHtml = '<i class="bi bi-arrow-repeat spinner-border spinner-border-sm me-1" role="status"></i>';
                } else if (taskData.phase === 'done') {
                    iconHtml = '<i class="bi bi-check-circle-fill me-1"></i>';
                } else if (taskData.phase === 'failed') {
                    iconHtml = '<i class="bi bi-exclamation-triangle-fill me-1"></i>';
                } else {
                    iconHtml = '<i class="bi bi-clock me-1"></i>';
                }
                statusBadge.innerHTML = iconHtml + taskData.phase;
            }
            
            // Update task container classes for visual styling
            const container = taskElement.closest('.pipeline-step');
            if (container) {
                // Remove all status classes
                container.classList.remove('completed', 'running', 'failed');
                // Add current status class
                if (taskData.phase === 'done') {
                    container.classList.add('completed');
                } else if (taskData.phase === 'running') {
                    container.classList.add('running');
                } else if (taskData.phase === 'failed') {
                    container.classList.add('failed');
                }
            }
            
            // Update last update time
            const lastUpdateElement = taskElement.querySelector('.small.text-muted:last-of-type');
            if (lastUpdateElement && taskData.lastUpdate) {
                lastUpdateElement.innerHTML = `<strong>Last Update:</strong> ${new Date(taskData.lastUpdate).toLocaleString()}`;
            }
            
            // Add/remove LIVE link
            const liveLink = taskElement.querySelector('.badge.bg-danger');
            if (taskData.phase === 'running' && !liveLink) {
                // Add LIVE link
                const taskTitle = taskElement.querySelector('h6');
                if (taskTitle) {
                    taskTitle.insertAdjacentHTML('beforeend', 
                        '<a href="/live" class="ms-2 badge bg-danger text-decoration-none" title="View Live Activity">' +
                        '<i class="bi bi-broadcast me-1"></i>LIVE</a>'
                    );
                }
            } else if (taskData.phase !== 'running' && liveLink) {
                // Remove LIVE link
                liveLink.remove();
            }
        }
        
        // Update task completion counts in the info card
        this.refreshSequenceTaskCounts();
    }
    
    // Refresh task completion counts in sequence detail
    refreshSequenceTaskCounts() {
        if (window.location.pathname.startsWith('/sequence/')) {
            // Count current task statuses from DOM
            const completedTasks = document.querySelectorAll('.pipeline-step.completed').length;
            const totalTasks = document.querySelectorAll('.pipeline-step').length;
            
            // Update completion count display
            const completedCountElement = document.querySelector('.task-stats .text-success');
            if (completedCountElement) {
                completedCountElement.textContent = completedTasks;
            }
        }
    }
    
    // Update summary cards on sequences dashboard
    updateSequenceSummaryCards(changedPhase) {
        // Fetch updated sequence counts from server
        if (window.location.pathname === '/sequences') {
            this.refreshSequenceSummaryCards();
        }
        
        // Also trigger visual feedback
        const refreshIcon = document.querySelector('.bi-arrow-clockwise');
        if (refreshIcon) {
            refreshIcon.style.animation = 'spin 1s linear';
            setTimeout(() => {
                refreshIcon.style.animation = '';
            }, 1000);
        }
    }
    
    // Refresh sequence summary cards with actual data
    async refreshSequenceSummaryCards() {
        try {
            const response = await fetch('/api/sequences');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const sequences = await response.json();
            
            // Update each summary card
            const completedCount = sequences.filter(s => s.phase === 'done').length;
            const runningCount = sequences.filter(s => s.phase === 'running').length;
            const failedCount = sequences.filter(s => s.phase === 'failed').length;
            const pendingCount = sequences.filter(s => ['pending', 'paused'].includes(s.phase)).length;
            
            // Update card values
            const cards = document.querySelectorAll('.card .card-body h3');
            if (cards.length >= 4) {
                cards[0].textContent = completedCount; // Completed
                cards[1].textContent = runningCount;   // Running
                cards[2].textContent = failedCount;    // Failed  
                cards[3].textContent = pendingCount;   // Pending/Paused
            }
            
        } catch (error) {
            console.error('Failed to refresh sequence summary cards:', error);
        }
    }
    
    // Load log content asynchronously
    async loadLogContent(taskId, logFile, targetElementId) {
        const targetElement = document.getElementById(targetElementId);
        const loadingSpinner = document.getElementById('loading-spinner');
        
        if (!targetElement) {
            console.error('Target element not found:', targetElementId);
            return;
        }
        
        try {
            // Show loading state
            if (loadingSpinner) {
                loadingSpinner.style.display = 'block';
            }
            targetElement.innerHTML = '<div class="text-muted p-3">Loading...</div>';
            
            const response = await fetch(`/log/${taskId}/${logFile}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const content = await response.text();
            
            if (content.trim() === '') {
                targetElement.innerHTML = '<div class="text-muted p-3">No log content available.</div>';
            } else {
                targetElement.innerHTML = `<pre class="log-content">${this.escapeHtml(content)}</pre>`;
            }
            
        } catch (error) {
            console.error('Failed to load log:', error);
            targetElement.innerHTML = `<div class="text-danger p-3">Failed to load log: ${error.message}</div>`;
        } finally {
            // Hide loading state
            if (loadingSpinner) {
                loadingSpinner.style.display = 'none';
            }
        }
    }
    
    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Format duration in human-readable format
    formatDuration(seconds) {
        if (!seconds) return 'N/A';
        
        if (seconds < 60) {
            return `${seconds.toFixed(1)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }
    
    // Format file size in human-readable format
    formatFileSize(bytes) {
        if (!bytes) return 'N/A';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
}

// --- Initialize Global Dashboard ---
window.dashboard = new ClaudeDashboard();
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard.initWebSocket();
});

// Expose utility functions globally for inline event handlers
window.loadLog = function(taskId, logFile, targetElementId) {
    window.dashboard.loadLogContent(taskId, logFile, targetElementId);
};

// Handle browser back/forward navigation
window.addEventListener('popstate', function(event) {
    // Reload page on navigation to ensure fresh data
    window.location.reload();
});