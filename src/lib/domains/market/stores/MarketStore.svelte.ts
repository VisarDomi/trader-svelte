import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle } from '$lib/shared/types/market.js';
import type { FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';
import { MarketCmd, type MarketCommand } from './MarketCommands.js';
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
    private _bidHistory: ChartCandle[] = [];
    private _askHistory: ChartCandle[] = [];
    private _liveBidCandle: ChartCandle | null = null;
    private _liveAskCandle: ChartCandle | null = null;

    constructor() {
        super();
    }

    get currentPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
    }

    // --- Read-only Queries ---

    hasBidHistory(): boolean {
        return this._bidHistory.length > 0;
    }

    getOldestBidTime(): number {
        return this._bidHistory.length > 0 ? this._bidHistory[0].time : 0;
    }

    getNewestBidTime(): number {
        return this._bidHistory.length > 0 ? this._bidHistory[this._bidHistory.length - 1].time : 0;
    }

    getLiveBidCandle(): ChartCandle | null {
        return this._liveBidCandle;
    }

    getLiveAskCandle(): ChartCandle | null {
        return this._liveAskCandle;
    }

    // --- Command Dispatch ---

    dispatch(cmd: MarketCommand) {
        switch (cmd.tag) {
            case MarketCmd.Reset:
                this._reset(cmd.dataSource);
                break;
            case MarketCmd.SetHistory:
                this._setHistory(cmd.bid, cmd.ask);
                break;
            case MarketCmd.SetLoaded:
                this._setLoaded(cmd.loaded);
                break;
            case MarketCmd.PrependHistory:
                this._prependHistory(cmd.bid, cmd.ask);
                break;
            case MarketCmd.MergeLatestHistory:
                this._mergeLatestHistory(cmd.bid, cmd.ask);
                break;
            case MarketCmd.UpdateLive:
                this._updateLive(cmd.update);
                break;
            case MarketCmd.SetDataSource:
                this._setDataSource(cmd.source);
                break;
        }
    }

    // --- Private Mutations ---

    private _reset(dataSource: ChartData) {
        this.isLoaded = false;
        this.bid = 0;
        this.offer = 0;
        this.lastCandle = null;
        this.updateTrigger = 0;
        this.history = [];
        this._bidHistory = [];
        this._askHistory = [];
        this._liveBidCandle = null;
        this._liveAskCandle = null;
        this.dataSource = dataSource;
        this.marketStatus = "CLOSED";
    }

    private _setLoaded(loaded: boolean) {
        this.isLoaded = loaded;
    }

    private _setHistory(bid: ChartCandle[], ask: ChartCandle[]) {
        this._bidHistory = bid;
        this._askHistory = ask;
        this.recalcLiveState();
        this.syncViewToSource();
        this.updateTrigger++;
    }

    private _prependHistory(bid: ChartCandle[], ask: ChartCandle[]) {
        // Prepend new older data
        this._bidHistory = [...bid, ...this._bidHistory];
        this._askHistory = [...ask, ...this._askHistory];

        this.syncViewToSource();
        // We do NOT trigger recalcLiveState here as live data is at the end
        this.updateTrigger++;
    }

    /**
     * Merges a fresh batch of recent history (e.g. from Sync) into the existing history.
     * Preserves older data that isn't in the new batch.
     */
    private _mergeLatestHistory(newBid: ChartCandle[], newAsk: ChartCandle[]) {
        if (newBid.length === 0) return;

        // If server data doesn't extend beyond what we already have, skip entirely.
        // Completed candles don't change — tick-built local data is authoritative.
        // This prevents unnecessary series.setData() calls that cause chart flicker.
        const lastExistingTime = this._bidHistory.length > 0
            ? this._bidHistory[this._bidHistory.length - 1].time
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

        this._bidHistory = merge(this._bidHistory, newBid);
        this._askHistory = merge(this._askHistory, newAsk);

        // Do NOT call recalcLiveState() here — the live candle is maintained
        // by the feed aggregator via updateLive(). Overwriting it with the last
        // history candle causes the chart to briefly lose the current-minute bar,
        // and series.update() re-adding it shifts the view right by one bar.
        this.syncViewToSource();
        this.updateTrigger++;
    }

    private _updateLive(u: FeedUpdate) {
        this.bid = u.bid;
        this.offer = u.offer;

        if (u.completedBid) this._bidHistory.push(u.completedBid);
        if (u.completedAsk) this._askHistory.push(u.completedAsk);

        this._liveBidCandle = u.liveBid;
        this._liveAskCandle = u.liveAsk;

        if (this.isLoaded) {
            this.syncViewToSource();
            this.updateTrigger++;
        }
    }

    private _setDataSource(source: ChartData) {
        if (this.dataSource === source) return;
        this.dataSource = source;
        this.syncViewToSource();
    }

    private recalcLiveState() {
        this._liveBidCandle = this._bidHistory.length > 0 ? this._bidHistory[this._bidHistory.length - 1] : null;
        this._liveAskCandle = this._askHistory.length > 0 ? this._askHistory[this._askHistory.length - 1] : null;

        if (this._liveBidCandle) this.bid = this._liveBidCandle.close;
        if (this._liveAskCandle) this.offer = this._liveAskCandle.close;
    }

    private syncViewToSource() {
        if (this.dataSource === TRADING.CHART_DATA_SOURCE_OFR) {
            this.history = this._askHistory;
            this.lastCandle = this._liveAskCandle;
        } else {
            this.history = this._bidHistory;
            this.lastCandle = this._liveBidCandle;
        }
    }
}

export const marketStore = new MarketStore();