class WebSocketClient {
    constructor(incidentId, unitId, onMessage, onStatusChange) {
        this.incidentId = incidentId;
        this.unitId = unitId;
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
        this.ws = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.baseDelay = 1000;
    }

    connect() {
        if(!this.incidentId || !this.unitId) return;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}/ws/${this.incidentId}/${this.unitId}`;

        this.onStatusChange('reconnecting');

        try {
            this.ws = new WebSocket(url);
        } catch (e) {
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this.retryCount = 0;
            this.onStatusChange('connected');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.onMessage(data);
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };

        this.ws.onclose = () => {
            this.onStatusChange('disconnected');
            this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            // onclose will fire after this
        };
    }

    scheduleReconnect() {
        if (this.retryCount >= this.maxRetries) {
            this.onStatusChange('disconnected');
            return;
        }
        this.onStatusChange('reconnecting');
        const delay = this.baseDelay * Math.pow(2, this.retryCount);
        this.retryCount++;
        setTimeout(() => this.connect(), delay);
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    disconnect() {
        this.maxRetries = 0; // prevent reconnect
        if (this.ws) {
            this.ws.close();
        }
    }
}
