import { DateTime } from "luxon";
import type { ISeriesApi, CandlestickData, UTCTimestamp, Time } from 'lightweight-charts';
import * as API from '$lib/constants/api.js';
import * as TRADING from '$lib/constants/trading.js';
import * as AUTH_CONST from '$lib/constants/auth.js';
import { getBaseUrl } from "$lib/utils/helpers.js";
import type { SessionTokens } from "$lib/types/auth";
import type { URL_TYPE } from "$lib/types/url";

interface MarketDataPayload {
    destination: string;
    payload: {
        epic: string;
        bid: number;
        ofr: number;
        timestamp: number;
    };
}

export class MarketService {
    private liveCandle: CandlestickData | null = null;
    private series: ISeriesApi<"Candlestick"> | null = null;
    private socket: WebSocket | null = null;
    private pingInterval: ReturnType<typeof setInterval> | null = null;

    // We store these to handle the logic
    private tokens: SessionTokens | null = null;
    private epic: string = "";
    private type: URL_TYPE = AUTH_CONST.REAL_TYPE; // Default to real for charts

    constructor(series: ISeriesApi<"Candlestick">) {
        this.series = series;
    }

    public async initialize(epic: string, type: URL_TYPE, tokens: SessionTokens) {
        this.epic = epic;
        this.type = type;
        this.tokens = tokens;

        await this.loadHistoricalData();
        this.connectWebSocket();
    }

    public destroy() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    // --- REST: Historical Data ---

    private async loadHistoricalData() {
        if (!this.series || !this.tokens) return;

        // Calculate time range (Last 1000 minutes)
        const endDateTime = DateTime.utc();
        const fromUTCDateTime = endDateTime.minus({ minutes: 1000 });

        // Format: YYYY-MM-DDTHH:mm:ss (Capital.com requirement)
        const fromUTC = fromUTCDateTime.startOf("second").toISO({ suppressMilliseconds: true })?.slice(0, -1) || "";
        const toUTC = endDateTime.startOf("second").toISO({ suppressMilliseconds: true })?.slice(0, -1) || "";

        const baseUrl = getBaseUrl(this.type);
        const url = `${baseUrl}${API.PRICES_ENDPOINT}/${this.epic}?resolution=${API.RESOLUTION_MINUTE}&max=${API.MAX_ROWS}&from=${fromUTC}&to=${toUTC}`;

        try {
            const response = await fetch(url, {
                method: API.GET_METHOD,
                headers: {
                    [API.CST_KEY]: this.tokens[API.CST_KEY],
                    [API.X_SECURITY_TOKEN_KEY]: this.tokens[API.X_SECURITY_TOKEN_KEY]
                }
            });

            if (!response.ok) throw new Error("Failed to fetch historical data");

            const data = await response.json();

            const candles: CandlestickData[] = data.prices.map((p: any) => {
                const time = (Date.parse(p.snapshotTimeUTC) / 1000) as UTCTimestamp;
                return {
                    time: time,
                    open: p.openPrice.bid,
                    high: p.highPrice.bid,
                    low: p.lowPrice.bid,
                    close: p.closePrice.bid
                };
            });

            this.series.setData(candles);

            if (candles.length > 0) {
                this.liveCandle = candles[candles.length - 1];
            }

        } catch (e) {
            console.error("Error fetching history:", e);
        }
    }

    // --- WebSocket: Live Streaming ---

    private connectWebSocket() {
        if (!this.tokens) return;

        console.log("Connecting to WebSocket...");
        this.socket = new WebSocket(`${API.WEBSOCKET_BASE_URL}${API.WEBSOCKET_PATH}`);

        this.socket.onopen = () => {
            console.log("WebSocket Connected");
            this.subscribeToMarketData();
            this.startPing();
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data as string);
                this.handleMessage(data);
            } catch (e) {
                console.error("WebSocket Parse Error", e);
            }
        };

        this.socket.onerror = (err) => console.error("WebSocket Error", err);
        this.socket.onclose = () => console.log("WebSocket Closed");
    }

    private subscribeToMarketData() {
        if (!this.socket || !this.tokens) return;

        const msg = {
            destination: API.MARKET_DATA_DESTINATION,
            correlationId: API.MARKET_DATA_CORRELATION_ID,
            cst: this.tokens[API.CST_KEY],
            securityToken: this.tokens[API.X_SECURITY_TOKEN_KEY],
            payload: {
                epics: [this.epic]
            }
        };
        this.socket.send(JSON.stringify(msg));
    }

    private startPing() {
        // Ping every 5 minutes (300,000 ms) to keep connection alive
        this.pingInterval = setInterval(() => {
            if (this.socket && this.tokens) {
                console.log("Sending Ping...");
                const ping = {
                    destination: API.PING_DESTINATION,
                    correlationId: API.PING_CORRELATION_ID,
                    cst: this.tokens[API.CST_KEY],
                    securityToken: this.tokens[API.X_SECURITY_TOKEN_KEY]
                };
                this.socket.send(JSON.stringify(ping));
            }
        }, 300_000);
    }

    private handleMessage(data: any) {
        // Ensure it represents a market update for our epic
        if (data.destination === API.MARKET_DATA_DESTINATION && data.payload?.epic === this.epic) {
            this.updateCandle(data.payload);
        }
    }

    private updateCandle(payload: any) {
        if (!this.series || !this.liveCandle) return;

        // Use BID price for charting
        const price = payload.bid;
        if (!price) return;

        const timestamp = payload.timestamp;
        const dt = DateTime.fromMillis(timestamp);
        const startOfMinute = dt.startOf("minute").toMillis() / 1000 as UTCTimestamp;

        const currentCandleTime = this.liveCandle.time as number;

        if (startOfMinute > currentCandleTime) {
            // --- NEW MINUTE: Create a new candle ---
            this.liveCandle = {
                time: startOfMinute,
                open: price,
                high: price,
                low: price,
                close: price
            };
        } else {
            // --- SAME MINUTE: Update existing candle ---
            this.liveCandle = {
                ...this.liveCandle,
                high: Math.max(this.liveCandle.high, price),
                low: Math.min(this.liveCandle.low, price),
                close: price
            };
        }

        // Update the chart
        this.series.update(this.liveCandle);
    }
}