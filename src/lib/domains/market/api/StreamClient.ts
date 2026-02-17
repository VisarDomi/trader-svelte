import * as API from '$lib/shared/constants/api.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import type { SessionTokens } from '$lib/shared/types/auth.js';
import type { QuoteMessage, WebSocketPayload } from '$lib/shared/types/market.js';
import { log } from '$lib/shared/utils/log.js';

type PriceUpdateCallback = (msg: QuoteMessage) => void;

export class StreamClient {
    private ws: WebSocket | null = null;
    private pingInterval: ReturnType<typeof setInterval> | null = null;

    // Resilience State
    private isIntentionalClose = false;
    private retryCount = 0;
    private readonly MAX_RETRIES = 10;
    private readonly BASE_DELAY = 1000;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private tokens: SessionTokens,
        private epic: string,
        private onPriceUpdate: PriceUpdateCallback
    ) {}

    connect() {
        this.isIntentionalClose = false;

        if (this.ws?.readyState === WebSocket.OPEN) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

        const wsUrl = `${API.WEBSOCKET_BASE_URL}${API.WEBSOCKET_PATH}`;

        try {
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = this.handleOpen;
            this.ws.onmessage = this.handleMessage;
            this.ws.onerror = this.handleError;
            this.ws.onclose = this.handleClose;
        } catch (e) {
            log.error("[StreamClient] Connection failed immediately", e);
            this.scheduleReconnect();
        }
    }

    disconnect() {
        this.isIntentionalClose = true;
        this.stopPing();

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            // Remove listeners to prevent "onclose" triggering reconnect
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.onclose = null;

            this.ws.close();
            this.ws = null;
        }

        this.retryCount = 0;
    }

    private handleOpen = () => {
        log.info(`[StreamClient] Connected to ${this.epic}`);
        this.retryCount = 0; // Reset backoff on success
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
            log.error("[StreamClient] Parse Error", err);
        }
    };

    private handleError = (event: Event) => {
        // WS errors are usually followed by Close, which handles the retry.
        log.warn("[StreamClient] Socket Error", event);
    };

    private handleClose = (event: CloseEvent) => {
        this.stopPing();
        this.ws = null;

        if (!this.isIntentionalClose) {
            log.warn(`[StreamClient] Unexpected close (Code: ${event.code}). Reconnecting...`);
            this.scheduleReconnect();
        }
    };

    private scheduleReconnect() {
        if (this.isIntentionalClose) return;
        if (this.retryCount >= this.MAX_RETRIES) {
            log.error("[StreamClient] Max retries exceeded. Giving up.");
            return;
        }

        const delay = Math.min(this.BASE_DELAY * Math.pow(1.5, this.retryCount), 30000); // Cap at 30s
        log.info(`[StreamClient] Retry attempt ${this.retryCount + 1} in ${delay}ms`);

        this.reconnectTimer = setTimeout(() => {
            this.retryCount++;
            this.connect();
        }, delay);
    }

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