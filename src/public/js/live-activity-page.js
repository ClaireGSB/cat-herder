document.addEventListener('DOMContentLoaded', function() {
    // Initialize the main WebSocket connection for the dashboard.
    // This will be responsible for handling all real-time updates through dashboard.js.
    window.dashboard.initWebSocket();
    
    // After the WebSocket is initialized, tell the dashboard to set up
    // the live view, passing the initial data rendered by the server.
    if (window.dashboard && typeof window.dashboard.initializeLiveView === 'function') {
        const initialData = window.liveActivityData || {};
        window.dashboard.initializeLiveView(initialData.runningTask);
    }
});