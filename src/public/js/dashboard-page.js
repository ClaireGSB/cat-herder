// Dashboard page initialization
document.addEventListener('DOMContentLoaded', function() {
    // Auto-refresh dashboard every 30 seconds if no WebSocket
    if (!window.dashboard.websocket) {
        setInterval(() => {
            window.location.reload();
        }, 30000);
    }
    
    // Initialize WebSocket for real-time updates
    window.dashboard.initWebSocket();
});