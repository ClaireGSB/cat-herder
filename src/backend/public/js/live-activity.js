// This file's only job is to tell the main dashboard to set up the live view.
function initializeLiveActivity() {
    if (window.dashboard && typeof window.dashboard.initializeLiveView === 'function') {
        const initialData = window.liveActivityData || {};
        window.dashboard.initializeLiveView(initialData.runningTask);
    }
}

document.addEventListener('DOMContentLoaded', initializeLiveActivity);