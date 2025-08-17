// Task detail page initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize WebSocket for real-time updates
    if (window.dashboard) {
        window.dashboard.initWebSocket();
    }
});

// --- NEW: Function to fetch and display log content ---
async function loadLog(taskId, logFile) {
    const logViewer = document.getElementById('log-content');
    const spinner = document.getElementById('loading-spinner');

    if (!logViewer || !spinner) return;

    // Show loading state
    spinner.style.display = 'block';
    logViewer.innerHTML = '<div class="text-muted p-4 text-center">Loading log...</div>';

    try {
        const response = await fetch(`/log/${taskId}/${logFile}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load log: ${response.status} ${response.statusText}`);
        }

        const logText = await response.text();

        // Reuse the colorizer from dashboard.js to render the log
        if (window.dashboard && typeof window.dashboard.colorizeLogLine === 'function') {
            const lines = logText.split('\n');
            logViewer.innerHTML = lines.map(line => window.dashboard.colorizeLogLine(line)).join('');
        } else {
            // Fallback to plain text if colorizer isn't available
            logViewer.textContent = logText;
        }

    } catch (error) {
        console.error('Error loading log:', error);
        logViewer.innerHTML = `<div class="text-danger p-4 text-center">Error loading log file: ${error.message}</div>`;
    } finally {
        // Hide loading state
        spinner.style.display = 'none';
    }
}