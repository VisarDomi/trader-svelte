import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle } from '$lib/shared/types/market.js';
import type { FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';
import * as TRADING from '$lib/shared/constants/trading.js';

export class MarketStore extends BaseStore {
    // Current Prices
    bid = $state(0);
    offer = $state(0);

    // Candle Data
    lastCandle = $state.raw<ChartCandle | null>(null);
    history = $state.raw<ChartCandle[]>([]);

    // State Flags
    isLoaded = $state(false);
    // Used by charts to trigger a re-render when data arrives
    updateTrigger = $state(0);

    // Config
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);

    // Internal State (Public Read, Private Write via actions)
    // These are needed by the Pump to seed the Feed
    bidHistory: ChartCandle[] = [];
    askHistory: ChartCandle[] = [];
    liveBidCandle: ChartCandle | null = null;
    liveAskCandle: ChartCandle | null = null;

    constructor() {
        super();
    }

    get currentPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
    }

    // --- Actions (Called by Pump or UI) ---

    reset(dataSource: ChartData) {
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
        this.dataSource = dataSource;
    }

    setLoaded(loaded: boolean) {
        this.isLoaded = loaded;
    }

    setHistory(bid: ChartCandle[], ask: ChartCandle[]) {
        this.bidHistory = bid;
        this.askHistory = ask;

        // Initialize live candles from end of history
        this.liveBidCandle = this.bidHistory.length > 0 ? this.bidHistory[this.bidHistory.length - 1] : null;
        this.liveAskCandle = this.askHistory.length > 0 ? this.askHistory[this.askHistory.length - 1] : null;

        if (this.liveBidCandle) this.bid = this.liveBidCandle.close;
        if (this.liveAskCandle) this.offer = this.liveAskCandle.close;

        this.syncViewToSource();
        this.updateTrigger++;
    }

    updateLive(u: FeedUpdate) {
        this.bid = u.bid;
        this.offer = u.offer;

        // If a candle completed, append to history
        if (u.completedBid) this.bidHistory.push(u.completedBid);
        if (u.completedAsk) this.askHistory.push(u.completedAsk);

        this.liveBidCandle = u.liveBid;
        this.liveAskCandle = u.liveAsk;

        if (this.isLoaded) {
            this.syncViewToSource();
            this.updateTrigger++;
        }
    }

    setDataSource(source: ChartData) {
        if (this.dataSource === source) return;
        this.dataSource = source;
        this.syncViewToSource();
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
}

export const marketStore = new MarketStore();