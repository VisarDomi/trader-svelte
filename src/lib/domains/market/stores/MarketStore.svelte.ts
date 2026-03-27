import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle } from '$lib/shared/types/market.js';
import type { FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';
import { MarketCmd, type MarketCommand } from './MarketCommands.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';

export class MarketStore extends BaseStore {

    // --- High-frequency reactive state (every tick) ---
    bid = $state(0);
    offer = $state(0);
    lastCandle = $state.raw<ChartCandle | null>(null);
    updateTrigger = $state(0);

    // --- Low-frequency reactive state (history mutations only) ---
    history = $state.raw<ChartCandle[]>([]);
    historyVersion = $state(0);
    pendingPrependCount = $state(0);

    isLoaded = $state(false);
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);
    marketStatus = $state("CLOSED");
    epic = $state("");

    // --- Private backing data (mutable, never aliased to reactive state) ---
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
            case MarketCmd.SetMetadata:
                this._setMetadata(cmd.epic, cmd.status);
                break;
        }
    }

    private _reset(dataSource: ChartData) {
        this.isLoaded = false;
        this.bid = 0;
        this.offer = 0;
        this.lastCandle = null;
        this.updateTrigger = 0;
        this.history = [];
        this.historyVersion = 0;
        this.pendingPrependCount = 0;
        this._bidHistory = [];
        this._askHistory = [];
        this._liveBidCandle = null;
        this._liveAskCandle = null;
        this.dataSource = dataSource;
        this.marketStatus = "CLOSED";
    }

    private _setMetadata(epic: string, status: string) {
        this.epic = epic;
        this.marketStatus = status;
    }

    private _setLoaded(loaded: boolean) {
        this.isLoaded = loaded;
    }

    private _setHistory(bid: ChartCandle[], ask: ChartCandle[]) {
        this._bidHistory = bid;
        this._askHistory = ask;
        this.recalcLiveState();
        this.publishHistory();
        this.updateTrigger++;
    }

    private _prependHistory(bid: ChartCandle[], ask: ChartCandle[]) {
        this._bidHistory = [...bid, ...this._bidHistory];
        this._askHistory = [...ask, ...this._askHistory];
        this.pendingPrependCount = bid.length;
        this.publishHistory();
        this.updateTrigger++;
    }

    private _mergeLatestHistory(newBid: ChartCandle[], newAsk: ChartCandle[]) {
        if (newBid.length === 0) return;

        const lastExistingTime = this._bidHistory.length > 0
            ? this._bidHistory[this._bidHistory.length - 1].time
            : 0;
        const lastNewTime = newBid[newBid.length - 1].time;
        if (lastNewTime <= lastExistingTime) return;

        const merge = (oldArr: ChartCandle[], newArr: ChartCandle[]) => {
            if (oldArr.length === 0) return newArr;
            const firstNewTime = newArr[0].time;
            const cutOffIndex = oldArr.findIndex(c => c.time >= firstNewTime);
            if (cutOffIndex === -1) {
                return [...oldArr, ...newArr];
            }
            return [...oldArr.slice(0, cutOffIndex), ...newArr];
        };

        this._bidHistory = merge(this._bidHistory, newBid);
        this._askHistory = merge(this._askHistory, newAsk);
        this.publishHistory();
        this.updateTrigger++;
    }

    private _updateLive(u: FeedUpdate) {
        this.bid = u.bid;
        this.offer = u.offer;

        // Candle completion: append to backing arrays and publish new snapshot.
        // This happens at most once per minute — the spread cost is negligible.
        const hasCompletion = u.completedBid || u.completedAsk;
        if (u.completedBid) this._bidHistory = [...this._bidHistory, u.completedBid];
        if (u.completedAsk) this._askHistory = [...this._askHistory, u.completedAsk];

        this._liveBidCandle = u.liveBid;
        this._liveAskCandle = u.liveAsk;

        if (this.isLoaded) {
            if (hasCompletion) {
                this.publishHistory();
            }
            this.publishLiveCandle();
            this.updateTrigger++;
        }
    }

    private _setDataSource(source: ChartData) {
        if (this.dataSource === source) return;
        this.dataSource = source;
        this.publishHistory();
    }

    private recalcLiveState() {
        this._liveBidCandle = this._bidHistory.length > 0 ? this._bidHistory[this._bidHistory.length - 1] : null;
        this._liveAskCandle = this._askHistory.length > 0 ? this._askHistory[this._askHistory.length - 1] : null;

        if (this._liveBidCandle) this.bid = this._liveBidCandle.close;
        if (this._liveAskCandle) this.offer = this._liveAskCandle.close;
    }

    /** Snapshot the active backing array into `history` — always a new reference. */
    private publishHistory() {
        const prevCandles = this.history.length;

        if (this.dataSource === TRADING.CHART_DATA_SOURCE_OFR) {
            this.history = [...this._askHistory];
            this.lastCandle = this._liveAskCandle;
        } else {
            this.history = [...this._bidHistory];
            this.lastCandle = this._liveBidCandle;
        }
        this.historyVersion++;

        // Log on initial load, first sync, or when candle count jumps (restore/gap fill)
        const delta = Math.abs(this.history.length - prevCandles);
        if (this.historyVersion <= 2 || delta > 5) {
            serverLog({
                tag: LogEvent.HistoryPublish,
                source: this.dataSource,
                version: this.historyVersion,
                candles: this.history.length,
                oldestTime: this.history.length > 0 ? this.history[0].time : 0,
                newestTime: this.history.length > 0 ? this.history[this.history.length - 1].time : 0,
            });
        }
    }

    /** Update only the live candle — no history snapshot needed. */
    private publishLiveCandle() {
        if (this.dataSource === TRADING.CHART_DATA_SOURCE_OFR) {
            this.lastCandle = this._liveAskCandle;
        } else {
            this.lastCandle = this._liveBidCandle;
        }
    }
}

export const marketStore = new MarketStore();
