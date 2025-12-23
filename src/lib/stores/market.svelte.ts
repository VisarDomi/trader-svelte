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

    // A signal that increments on every feed update
    updateTrigger = $state(0);

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
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistory(epic);

            this.bidHistory = bid;
            this.askHistory = ask;

            // Seed internal state from history end
            this.liveBidCandle = this.bidHistory.length > 0 ? this.bidHistory[this.bidHistory.length - 1] : null;
            this.liveAskCandle = this.askHistory.length > 0 ? this.askHistory[this.askHistory.length - 1] : null;

            if (this.liveBidCandle) this.bid = this.liveBidCandle.close;
            if (this.liveAskCandle) this.offer = this.liveAskCandle.close;

            // Init Feed
            this.feed.initialize(this.liveBidCandle, this.liveAskCandle);
            this.feed.connect(tokens, epic);

            this.syncViewToSource();
            this.isLoaded = true;

        } catch (e) {
            console.error("Failed to init market store", e);
        }
    }

    /**
     * FEATURE: Mid-minute History Sync
     * Fetches fresh history from API.
     * 1. Updates historical (closed) minutes.
     * 2. Merges the REST "last" candle (current minute) into the live aggregator
     *    to ensure High/Low/Open accuracy.
     */
    async syncHistory() {
        if (!this.epic || !this.isLoaded) return;

        const client = api.client;
        if (!client) return;

        try {
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistory(this.epic);

            // Helper: Split array into [History, Current]
            const split = (arr: ChartCandle[]) => {
                if (arr.length === 0) return { history: [], current: null };
                const current = arr[arr.length - 1];
                const history = arr.slice(0, -1);
                return { history, current };
            };

            const bidData = split(bid);
            const askData = split(ask);

            // 1. Update Historical Data (Closed minutes)
            this.bidHistory = bidData.history;
            this.askHistory = askData.history;

            // 2. Update View (Triggers setData on Chart)
            this.syncViewToSource();

            // 3. Merge Current Minute Data into Feed
            // This updates liveBidCandle/liveAskCandle internally with proper Open/High/Low
            this.feed.mergeExternalData(bidData.current, askData.current);

            // 4. Force trigger for Renderer to redraw the merged live candle
            this.updateTrigger++;

        } catch (e) {
            console.warn("[MarketStore] History sync failed", e);
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

    private resetState() {
        this.isLoaded = false;
        this.bid = 0;
        this.offer = 0;
        this.lastCandle = null;
        this.updateTrigger = 0;
        this.history = [];
        this.bidHistory = [];
        this.askHistory = [];
        this.liveBidCandle = null;
        this.liveAskCandle = null;
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
        this.bid = u.bid;
        this.offer = u.offer;

        // Handle Completed Candles (Push to history)
        if (u.completedBid) this.bidHistory.push(u.completedBid);
        if (u.completedAsk) this.askHistory.push(u.completedAsk);

        // Update Live Refs
        this.liveBidCandle = u.liveBid;
        this.liveAskCandle = u.liveAsk;

        // Update View
        if (this.isLoaded) {
            this.lastCandle = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR
                ? this.liveAskCandle
                : this.liveBidCandle;

            this.updateTrigger++;
        }
    }
}

export const marketStore = new MarketStore();