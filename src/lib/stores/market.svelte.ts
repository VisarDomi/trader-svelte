import { StreamClient } from '$lib/api/stream.js';
import { fetchPriceHistory, mapToCandles } from '$lib/services/market.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import { CandleAggregator } from '$lib/domain/market/CandleAggregator.js';
import * as TRADING from '$lib/constants/trading.js';
import type { ChartData } from '$lib/types/trading.js';
import type { ChartCandle, QuoteMessage, PriceSnapshot } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

export class MarketStore {
    // --- Public State (Runes) ---
    bid = $state(0);
    offer = $state(0);

    // The active candle to be drawn by the chart
    lastCandle = $state.raw<ChartCandle | null>(null);

    // The active history to be loaded by the chart
    history = $state.raw<ChartCandle[]>([]);

    isLoaded = $state(false);

    // --- Configuration ---
    epic = $state("");
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);

    // --- Internal State ---
    private stream: StreamClient | null = null;
    private aggregator = new CandleAggregator();

    // Data Containers
    private bidHistory: ChartCandle[] = [];
    private askHistory: ChartCandle[] = [];
    private liveBidCandle: ChartCandle | null = null;
    private liveAskCandle: ChartCandle | null = null;

    // Computed Helpers
    get currentPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
    }

    async init(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        this.resetState();
        this.epic = epic;
        this.dataSource = dataSource;

        this.connectStream();
        await this.loadHistory();
    }

    setDataSource(source: ChartData) {
        if (this.dataSource === source) return;
        this.dataSource = source;
        this.syncViewToSource();
    }

    disconnect() {
        if (this.stream) {
            this.stream.disconnect();
            this.stream = null;
        }
        this.isLoaded = false;
    }

    // --- Private Implementation ---

    private resetState() {
        this.isLoaded = false;
        this.bid = 0;
        this.offer = 0;
        this.lastCandle = null;
        this.history = [];
        this.bidHistory = [];
        this.askHistory = [];
        this.liveBidCandle = null;
        this.liveAskCandle = null;
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

        try {
            const rawHistory: PriceSnapshot[] = await fetchPriceHistory(client, this.epic);

            this.bidHistory = mapToCandles(rawHistory, TRADING.CHART_DATA_SOURCE_BID);
            this.askHistory = mapToCandles(rawHistory, TRADING.CHART_DATA_SOURCE_OFR);

            // Extract the last candle from history to serve as the initial "Live" candle.
            // This prevents timestamp overlap errors in Lightweight Charts.
            this.initializeLiveCandles();

            this.syncViewToSource();
            this.isLoaded = true;

        } catch (e) {
            console.error("Failed to load history", e);
        }
    }

    private initializeLiveCandles() {
        if (this.bidHistory.length > 0) {
            this.liveBidCandle = this.bidHistory.pop()!;
            if (this.bid === 0) this.bid = this.liveBidCandle.close;
        }
        if (this.askHistory.length > 0) {
            this.liveAskCandle = this.askHistory.pop()!;
            if (this.offer === 0) this.offer = this.liveAskCandle.close;
        }
    }

    private syncViewToSource() {
        if (this.dataSource === TRADING.CHART_DATA_SOURCE_OFR) {
            this.history = this.askHistory;
            this.lastCandle = this.liveAskCandle;
        } else {
            this.history = this.bidHistory;
            this.lastCandle = this.liveBidCandle;
        }
    }

    private handleQuote(msg: QuoteMessage) {
        this.bid = msg.payload.bid;
        this.offer = msg.payload.ofr;

        if (!this.isLoaded) return;

        const time = (Math.floor(msg.payload.timestamp / 1000 / 60) * 60) as UTCTimestamp;

        // Process Bid
        const bidResult = this.aggregator.processTick(this.liveBidCandle, this.bid, time);
        if (bidResult.completedCandle) {
            this.bidHistory.push(bidResult.completedCandle);
        }
        this.liveBidCandle = bidResult.liveCandle;

        // Process Ask
        const askResult = this.aggregator.processTick(this.liveAskCandle, this.offer, time);
        if (askResult.completedCandle) {
            this.askHistory.push(askResult.completedCandle);
        }
        this.liveAskCandle = askResult.liveCandle;

        // Update View
        this.lastCandle = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR
            ? this.liveAskCandle
            : this.liveBidCandle;
    }
}

export const marketStore = new MarketStore();