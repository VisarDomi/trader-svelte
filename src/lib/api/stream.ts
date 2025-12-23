import * as API from '$lib/constants/api.js';
import * as AUTH from '$lib/constants/auth.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { QuoteMessage, WebSocketPayload } from '$lib/types/market.js';

type PriceUpdateCallback = (msg: QuoteMessage) => void;

export class StreamClient {
    private ws: WebSocket | null = null;
    private pingInterval: ReturnType<typeof setInterval> | null = null;
    private isConnected = false;

    constructor(
        private tokens: SessionTokens,
        private epic: string,
        private onPriceUpdate: PriceUpdateCallback
    ) {}

    connect() {
        const wsUrl = `${API.WEBSOCKET_BASE_URL}${API.WEBSOCKET_PATH}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = this.handleOpen;
        this.ws.onmessage = this.handleMessage;
        this.ws.onerror = this.handleError;
        this.ws.onclose = this.handleClose;
    }

    disconnect() {
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    private handleOpen = () => {
        this.isConnected = true;
        this.subscribe();
        this.startPing();
    };

    private handleMessage = (event: MessageEvent) => {
        try {
            const data: QuoteMessage = JSON.parse(event.data);
            if (
                data.destination === API.DATA_DESTINATION_QUOTE &&
                data.payload &&
                data.payload[API.EPIC_KEY] === this.epic
            ) {
                this.onPriceUpdate(data);
            }
        } catch (err) {
            console.error("WS Parse Error", err);
        }
    };

    private handleError = (err: Event) => {
        console.error("WS Error", err);
    };

    private handleClose = () => {
        this.stopPing();
        this.isConnected = false;
    };

    private subscribe() {
        if (!this.ws) return;

        const subscribeRequest: WebSocketPayload = {
            destination: API.MARKET_DATA_DESTINATION,
            correlationId: API.MARKET_DATA_CORRELATION_ID,
            cst: this.tokens[API.CST_KEY],
            securityToken: this.tokens[API.X_SECURITY_TOKEN_KEY],
            payload: {
                [API.EPICS_KEY]: [this.epic]
            }
        };
        this.ws.send(JSON.stringify(subscribeRequest));
    }

    private startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const pingRequest: WebSocketPayload = {
                    destination: API.PING_DESTINATION,
                    correlationId: API.PING_CORRELATION_ID,
                    cst: this.tokens[API.CST_KEY],
                    securityToken: this.tokens[API.X_SECURITY_TOKEN_KEY]
                };
                this.ws.send(JSON.stringify(pingRequest));
            }
        }, AUTH.SESSION_PING_INTERVAL);
    }

    private stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
}