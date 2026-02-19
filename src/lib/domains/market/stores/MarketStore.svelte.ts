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
    updateTrigger = $state(0);

    // Config
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);

    // Status
    marketStatus = $state("CLOSED");
    epic = $state("");

    // Internal State
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

    // --- Actions ---

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
        this.marketStatus = "CLOSED";
    }

    setMetadata(epic: string, status: string) {
        this.epic = epic;
        this.marketStatus = status;
    }

    setLoaded(loaded: boolean) {
        this.isLoaded = loaded;
    }

    // Initial Full Set
    setHistory(bid: ChartCandle[], ask: ChartCandle[]) {
        this.bidHistory = bid;
        this.askHistory = ask;
        this.recalcLiveState();
        this.syncViewToSource();
        this.updateTrigger++;
    }

    // Infinite Scroll Prepend
    prependHistory(bid: ChartCandle[], ask: ChartCandle[]) {
        // Prepend new older data
        this.bidHistory = [...bid, ...this.bidHistory];
        this.askHistory = [...ask, ...this.askHistory];

        this.syncViewToSource();
        // We do NOT trigger recalcLiveState here as live data is at the end
        this.updateTrigger++;
    }

    /**
     * Merges a fresh batch of recent history (e.g. from Sync) into the existing history.
     * Preserves older data that isn't in the new batch.
     */
    mergeLatestHistory(newBid: ChartCandle[], newAsk: ChartCandle[]) {
        if (newBid.length === 0) return;

        // If server data doesn't extend beyond what we already have, skip entirely.
        // Completed candles don't change — tick-built local data is authoritative.
        // This prevents unnecessary series.setData() calls that cause chart flicker.
        const lastExistingTime = this.bidHistory.length > 0
            ? this.bidHistory[this.bidHistory.length - 1].time
            : 0;
        const lastNewTime = newBid[newBid.length - 1].time;
        if (lastNewTime <= lastExistingTime) return;

        const merge = (oldArr: ChartCandle[], newArr: ChartCandle[]) => {
            if (oldArr.length === 0) return newArr;
            const firstNewTime = newArr[0].time;

            // Find index of first candle in oldArr that is >= firstNewTime
            const cutOffIndex = oldArr.findIndex(c => c.time >= firstNewTime);

            if (cutOffIndex === -1) {
                // All old data is older than new data -> Append
                return [...oldArr, ...newArr];
            }

            // Keep old data before the overlap, append new data
            return [...oldArr.slice(0, cutOffIndex), ...newArr];
        };

        this.bidHistory = merge(this.bidHistory, newBid);
        this.askHistory = merge(this.askHistory, newAsk);

        // Do NOT call recalcLiveState() here — the live candle is maintained
        // by the feed aggregator via updateLive(). Overwriting it with the last
        // history candle causes the chart to briefly lose the current-minute bar,
        // and series.update() re-adding it shifts the view right by one bar.
        this.syncViewToSource();
        this.updateTrigger++;
    }

    updateLive(u: FeedUpdate) {
        this.bid = u.bid;
        this.offer = u.offer;

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

    private recalcLiveState() {
        this.liveBidCandle = this.bidHistory.length > 0 ? this.bidHistory[this.bidHistory.length - 1] : null;
        this.liveAskCandle = this.askHistory.length > 0 ? this.askHistory[this.askHistory.length - 1] : null;

        if (this.liveBidCandle) this.bid = this.liveBidCandle.close;
        if (this.liveAskCandle) this.offer = this.liveAskCandle.close;
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