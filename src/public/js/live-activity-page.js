document.addEventListener('DOMContentLoaded', function() {
    let currentPhase = window.liveActivityData?.runningTask?.phase || null;

    const patchInterval = setInterval(() => {
        const ws = window.dashboard?.websocket;
        if (ws && typeof ws.onmessage === 'function') {
            clearInterval(patchInterval);
            const originalOnMessage = ws.onmessage;

            ws.onmessage = function(event) {
                let needsReload = false;
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'task_update' && msg.data) {
                        const newPhase = msg.data.phase;
                        if (newPhase !== currentPhase) {
                            if ((currentPhase === 'running' && newPhase === 'waiting_for_input') ||
                                (currentPhase === 'waiting_for_input' && newPhase === 'running')) {
                                needsReload = true;
                            }
                            currentPhase = newPhase;
                        }
                    }
                } catch (e) { /* Ignore non-JSON messages */ }

                if (needsReload) {
                    window.location.reload();
                } else {
                    originalOnMessage.call(this, event);
                }
            };
        }
    }, 50);

    setTimeout(() => clearInterval(patchInterval), 5000); // Failsafe

    window.dashboard.initWebSocket();
    
    // Logic from live-activity.js is now here
    if (window.dashboard && typeof window.dashboard.initializeLiveView === 'function') {
        const initialData = window.liveActivityData || {};
        window.dashboard.initializeLiveView(initialData.runningTask);
    }
});