import { StreamClient } from '$lib/api/stream.js';
import { getHistoricalPrices } from '$lib/services/market.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import * as TRADING from '$lib/constants/trading.js';
import type { ChartData } from '$lib/types/trading.js';
import type { ChartCandle, QuoteMessage } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

export class MarketStore {
    // State Runes
    bid = $state(0);
    offer = $state(0);
    lastCandle = $state<ChartCandle | null>(null);
    history = $state<ChartCandle[]>([]);
    isLoaded = $state(false);

    // Configuration
    epic = $state("");
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);

    private stream: StreamClient | null = null;

    get currentPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
    }

    async init(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        this.epic = epic;
        this.dataSource = dataSource;
        this.isLoaded = false;

        // Reset prices to prevent stale data
        this.bid = 0;
        this.offer = 0;
        this.lastCandle = null;
        this.history = [];

        this.connectStream();
        await this.loadHistory();
    }

    async setDataSource(source: ChartData) {
        if (this.dataSource === source) return;
        this.dataSource = source;
        await this.loadHistory();
    }

    disconnect() {
        if (this.stream) {
            this.stream.disconnect();
            this.stream = null;
        }
        this.isLoaded = false;
    }

    private connectStream() {
        if (this.stream) return;

        const tokens = session.getTokens(session.mode);
        if (!tokens) return;

        this.stream = new StreamClient(tokens, this.epic, (msg) => this.handleQuote(msg));
        this.stream.connect();
    }

    private async loadHistory() {
        // CHANGED: Use active client (Demo or Real) instead of forcing Real
        const client = api.client;
        if (!client) {
            console.warn("No API client available for history loading");
            return;
        }

        this.isLoaded = false;
        try {
            const data = await getHistoricalPrices(client, this.epic, this.dataSource);
            this.history = data;

            if (data.length > 0) {
                this.lastCandle = { ...data[data.length - 1] };

                // Initialize current price if stream hasn't hit yet
                if (this.bid === 0) this.bid = this.lastCandle.close;
                if (this.offer === 0) this.offer = this.lastCandle.close;
            }
            this.isLoaded = true;
        } catch (e) {
            console.error("Failed to load history", e);
        }
    }

    private handleQuote(msg: QuoteMessage) {
        this.bid = msg.payload.bid;
        this.offer = msg.payload.ofr;

        if (this.isLoaded && this.lastCandle) {
            const price = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
            const timestampMs = msg.payload.timestamp;
            this.updateCandle(price, timestampMs);
        }
    }

    private updateCandle(price: number, timestampMs: number) {
        const time = (Math.floor(timestampMs / 1000 / 60) * 60) as UTCTimestamp;

        if (!this.lastCandle) {
            this.lastCandle = { time, open: price, high: price, low: price, close: price };
            return;
        }

        // Clone to ensure reactivity triggers
        const c = { ...this.lastCandle };

        if (time === c.time) {
            c.high = Math.max(c.high, price);
            c.low = Math.min(c.low, price);
            c.close = price;
        } else if (time > c.time) {
            // New Minute
            this.lastCandle = {
                time,
                open: price,
                high: price,
                low: price,
                close: price
            };
            return;
        }

        this.lastCandle = c;
    }
}

export const marketStore = new MarketStore();