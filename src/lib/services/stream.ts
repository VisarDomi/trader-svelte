import * as API from '$lib/constants/api.js';
import * as AUTH from "$lib/constants/auth";
import type { SessionTokens } from "$lib/types/auth.js";
import type { QuoteMessage, WebSocketPayload } from "$lib/types/market.js";

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
        const subscribeRequest: WebSocketPayload = {
            destination: API.MARKET_DATA_DESTINATION,
            correlationId: API.MARKET_DATA_CORRELATION_ID,
            cst: tokens[API.CST_KEY],
            securityToken: tokens[API.X_SECURITY_TOKEN_KEY],
            payload: {
                [API.EPICS_KEY]: [epic]
            }
        };
        ws.send(JSON.stringify(subscribeRequest));
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
        }, AUTH.SESSION_PING_INTERVAL);
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.destination === API.DATA_DESTINATION_QUOTE && data.payload && data.payload[API.EPIC_KEY] === epic) {
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