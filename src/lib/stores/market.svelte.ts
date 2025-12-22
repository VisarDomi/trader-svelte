import { MarketRepository } from '../repositories/MarketRepository.ts';
import { MarketFeed, type FeedUpdate } from '../services/market/MarketFeed.ts';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import * as TRADING from '$lib/constants/trading.js';
import type { ChartData } from '$lib/types/trading.js';
import type { ChartCandle } from '$lib/types/market.js';

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

    // --- Dependencies ---
    private feed: MarketFeed;

    // Data Containers (Internal State)
    private bidHistory: ChartCandle[] = [];
    private askHistory: ChartCandle[] = [];
    private liveBidCandle: ChartCandle | null = null;
    private liveAskCandle: ChartCandle | null = null;

    constructor() {
        // Initialize Feed with a callback bound to this store
        this.feed = new MarketFeed((update) => this.handleFeedUpdate(update));
    }

    get currentPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
    }

    async init(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        this.resetState();
        this.epic = epic;
        this.dataSource = dataSource;

        const client = api.client;
        const tokens = session.getTokens(session.mode);

        if (!client || !tokens) return;

        try {
            // 1. Load History via Repository
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistory(epic);

            this.bidHistory = bid;
            this.askHistory = ask;

            // 2. Initialize Feed State
            this.initializeLiveCandles();
            this.feed.initialize(this.liveBidCandle, this.liveAskCandle);

            // 3. Start Streaming
            this.feed.connect(tokens, epic);

            this.syncViewToSource();
            this.isLoaded = true;

        } catch (e) {
            console.error("Failed to init market store", e);
        }
    }

    setDataSource(source: ChartData) {
        if (this.dataSource === source) return;
        this.dataSource = source;
        this.syncViewToSource();
    }

    disconnect() {
        this.feed.disconnect();
        this.isLoaded = false;
    }

    // --- Internal Logic ---

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

    private handleFeedUpdate(u: FeedUpdate) {
        this.bid = u.tick.bid;
        this.offer = u.tick.offer;

        // Update Internal Containers
        this.liveBidCandle = u.bidResult.liveCandle;
        if (u.bidResult.completedCandle) {
            this.bidHistory.push(u.bidResult.completedCandle);
        }

        this.liveAskCandle = u.askResult.liveCandle;
        if (u.askResult.completedCandle) {
            this.askHistory.push(u.askResult.completedCandle);
        }

        // Update View (Reactivity)
        if (this.isLoaded) {
            this.lastCandle = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR
                ? this.liveAskCandle
                : this.liveBidCandle;
        }
    }
}

export const marketStore = new MarketStore();