import { StreamClient } from '$lib/api/stream.js';
import { fetchPriceHistory, mapToCandles } from '$lib/services/market.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import * as TRADING from '$lib/constants/trading.js';
import type { ChartData } from '$lib/types/trading.js';
import type { ChartCandle, QuoteMessage, PriceSnapshot } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

export class MarketStore {
    // State Runes
    bid = $state(0);
    offer = $state(0);

    // The active candle to be drawn by the chart
    lastCandle = $state.raw<ChartCandle | null>(null);

    // The active history to be loaded by the chart (Proxy-free for performance)
    history = $state.raw<ChartCandle[]>([]);

    isLoaded = $state(false);

    // Configuration
    epic = $state("");
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);

    // Internal Cache
    private stream: StreamClient | null = null;
    private rawHistory: PriceSnapshot[] = [];
    private bidHistory: ChartCandle[] = [];
    private askHistory: ChartCandle[] = [];

    // Background Accumulators
    private liveBidCandle: ChartCandle | null = null;
    private liveAskCandle: ChartCandle | null = null;

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
        this.rawHistory = [];
        this.bidHistory = [];
        this.askHistory = [];
        this.liveBidCandle = null;
        this.liveAskCandle = null;

        this.connectStream();
        await this.loadHistory();
    }

    setDataSource(source: ChartData) {
        if (this.dataSource === source) return;
        this.dataSource = source;

        // 1. Swap History
        // bidHistory/askHistory now contain only CLOSED candles, so no overlap with lastCandle
        this.history = source === TRADING.CHART_DATA_SOURCE_OFR ? this.askHistory : this.bidHistory;

        // 2. Swap Live Candle
        this.lastCandle = source === TRADING.CHART_DATA_SOURCE_OFR ? this.liveAskCandle : this.liveBidCandle;
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
            this.rawHistory = await fetchPriceHistory(client, this.epic);

            this.bidHistory = mapToCandles(this.rawHistory, TRADING.CHART_DATA_SOURCE_BID);
            this.askHistory = mapToCandles(this.rawHistory, TRADING.CHART_DATA_SOURCE_OFR);

            // Pop the last candle from history to serve as the initial "Live" candle.
            // This prevents duplicate timestamp errors because 'history' passed to setData
            // must not overlap with the 'update' calls for the current bar.
            if (this.bidHistory.length > 0) {
                this.liveBidCandle = this.bidHistory.pop()!;
                if (this.bid === 0) this.bid = this.liveBidCandle.close;
            }
            if (this.askHistory.length > 0) {
                this.liveAskCandle = this.askHistory.pop()!;
                if (this.offer === 0) this.offer = this.liveAskCandle.close;
            }

            // Set Initial View
            if (this.dataSource === TRADING.CHART_DATA_SOURCE_OFR) {
                this.history = this.askHistory;
                this.lastCandle = this.liveAskCandle;
            } else {
                this.history = this.bidHistory;
                this.lastCandle = this.liveBidCandle;
            }

            this.isLoaded = true;
        } catch (e) {
            console.error("Failed to load history", e);
        }
    }

    private handleQuote(msg: QuoteMessage) {
        this.bid = msg.payload.bid;
        this.offer = msg.payload.ofr;

        if (this.isLoaded) {
            const time = (Math.floor(msg.payload.timestamp / 1000 / 60) * 60) as UTCTimestamp;

            this.liveBidCandle = this.processTick(this.bidHistory, this.liveBidCandle, this.bid, time);
            this.liveAskCandle = this.processTick(this.askHistory, this.liveAskCandle, this.offer, time);

            this.lastCandle = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR
                ? this.liveAskCandle
                : this.liveBidCandle;
        }
    }

    private processTick(
        historyArr: ChartCandle[],
        currentCandle: ChartCandle | null,
        price: number,
        time: UTCTimestamp
    ): ChartCandle {
        if (!currentCandle) {
            return { time, open: price, high: price, low: price, close: price };
        }

        if (time > currentCandle.time) {
            // Commit closed candle to history
            // Since we popped it in init, it's not there yet.
            // If it's a new minute rolling over, we push the PREVIOUS one.
            historyArr.push(currentCandle);

            // Start new candle
            return {
                time,
                open: price,
                high: price,
                low: price,
                close: price
            };
        }

        const c = { ...currentCandle };
        c.high = Math.max(c.high, price);
        c.low = Math.min(c.low, price);
        c.close = price;
        return c;
    }
}

export const marketStore = new MarketStore();