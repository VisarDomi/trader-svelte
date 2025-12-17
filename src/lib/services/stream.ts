import * as API from '$lib/constants/api';
import type { SessionTokens } from "$lib/types/auth";
import type { QuoteMessage, WebSocketPayload } from "$lib/types/market";

type PriceUpdateCallback = (msg: QuoteMessage) => void;

export function connectToStream(
    tokens: SessionTokens,
    epic: string,
    onPriceUpdate: PriceUpdateCallback
) {
    const wsUrl = `${API.WEBSOCKET_BASE_URL}${API.WEBSOCKET_PATH}`;
    const ws = new WebSocket(wsUrl);
    let pingInterval: ReturnType<typeof setInterval>;

    ws.onopen = () => {
        // 1. Subscribe to Market Data
        const subscribeRequest: WebSocketPayload = {
            destination: API.MARKET_DATA_DESTINATION,
            correlationId: API.MARKET_DATA_CORRELATION_ID,
            cst: tokens[API.CST_KEY],
            securityToken: tokens[API.X_SECURITY_TOKEN_KEY],
            payload: {
                epics: [epic]
            }
        };
        ws.send(JSON.stringify(subscribeRequest));

        // 2. Setup Heartbeat (every 60s)
        pingInterval = setInterval(() => {
            const pingRequest: WebSocketPayload = {
                destination: API.PING_DESTINATION,
                correlationId: API.PING_CORRELATION_ID,
                cst: tokens[API.CST_KEY],
                securityToken: tokens[API.X_SECURITY_TOKEN_KEY]
            };
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(pingRequest));
            }
        }, 60000);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            // Filter for actual price quotes
            if (data.destination === 'quote' && data.payload && data.payload.epic === epic) {
                onPriceUpdate(data as QuoteMessage);
            }
        } catch (err) {
            console.error("WS Parse Error", err);
        }
    };

    ws.onerror = (err) => {
        console.error("WS Error", err);
    };

    return {
        destroy: () => {
            if (pingInterval) clearInterval(pingInterval);
            if (ws) ws.close();
        }
    };
}