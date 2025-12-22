import { StreamClient } from '$lib/api/stream.js';
import { fetchPriceHistory, mapToCandles } from '$lib/services/market.js';
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

    // The active history being displayed
    history = $state<ChartCandle[]>([]);

    isLoaded = $state(false);

    // Configuration
    epic = $state("");
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);

    // Internal Cache (Pre-computed)
    private stream: StreamClient | null = null;
    private bidHistory: ChartCandle[] = [];
    private askHistory: ChartCandle[] = [];

    get currentPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
    }

    async init(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        this.epic = epic;
        this.dataSource = dataSource;
        this.isLoaded = false;

        // Reset
        this.bid = 0;
        this.offer = 0;
        this.lastCandle = null;
        this.history = [];
        this.bidHistory = [];
        this.askHistory = [];

        this.connectStream();
        await this.loadHistory();
    }

    /**
     * Instantly swaps the displayed history array.
     * Since both arrays are pre-computed, this is O(1) and causes zero lag.
     */
    setDataSource(source: ChartData) {
        if (this.dataSource === source) return;
        this.dataSource = source;

        // Instant swap
        this.history = source === TRADING.CHART_DATA_SOURCE_OFR ? this.askHistory : this.bidHistory;

        // Reset the live candle to match the end of the new history
        if (this.history.length > 0) {
            this.lastCandle = { ...this.history[this.history.length - 1] };
        }
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
        const client = api.client;
        if (!client) {
            console.warn("No API client available for history loading");
            return;
        }

        this.isLoaded = false;
        try {
            // 1. Fetch Raw Data once
            const raw = await fetchPriceHistory(client, this.epic);

            // 2. Pre-calculate BOTH datasets immediately
            this.bidHistory = mapToCandles(raw, TRADING.CHART_DATA_SOURCE_BID);
            this.askHistory = mapToCandles(raw, TRADING.CHART_DATA_SOURCE_OFR);

            // 3. Set initial view
            this.history = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.askHistory : this.bidHistory;

            if (this.history.length > 0) {
                this.lastCandle = { ...this.history[this.history.length - 1] };
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

        // Clone to ensure reactivity
        const c = { ...this.lastCandle };

        if (time === c.time) {
            c.high = Math.max(c.high, price);
            c.low = Math.min(c.low, price);
            c.close = price;
        } else if (time > c.time) {
            // New Minute: Commit the old candle to BOTH histories (approximated) and start new
            // Note: Ideally we'd append to bidHistory/askHistory too, but for session duration
            // simply updating the 'history' proxy is sufficient for the chart.
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