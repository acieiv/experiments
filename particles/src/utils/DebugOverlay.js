/**
 * DebugOverlay.js
 * Provides a debug overlay for monitoring component states
 */

class DebugOverlay {
    constructor() {
        this.overlay = this.createOverlay();
        this.logs = [];
        this.states = new Map();
    }

    createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'debug-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 10px;
            font-family: monospace;
            font-size: 12px;
            z-index: 1000;
            border-radius: 4px;
            max-width: 400px;
            max-height: 300px;
            overflow-y: auto;
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        this.logs.push({ message, type, timestamp });
        if (this.logs.length > 50) this.logs.shift();
        this.update();
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    setState(component, state) {
        this.states.set(component, state);
        this.update();
    }

    update() {
        let html = '<strong>Debug Information:</strong><br><br>';
        
        // Component States
        html += '<strong>Component States:</strong><br>';
        this.states.forEach((state, component) => {
            const color = state === 'initialized' ? '#4CAF50' : 
                         state === 'error' ? '#f44336' : '#FFC107';
            html += `<span style="color: ${color}">${component}: ${state}</span><br>`;
        });

        // Recent Logs
        html += '<br><strong>Recent Logs:</strong><br>';
        this.logs.slice(-10).forEach(log => {
            const color = log.type === 'error' ? '#f44336' : 
                         log.type === 'warn' ? '#FFC107' : '#4CAF50';
            html += `<span style="color: ${color}">[${log.timestamp}] ${log.message}</span><br>`;
        });

        this.overlay.innerHTML = html;
    }

    showError(error) {
        this.log(error.message || 'Unknown error', 'error');
    }
}

export default DebugOverlay;
