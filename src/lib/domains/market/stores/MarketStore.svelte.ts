import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle } from '$lib/shared/types/market.js';
import type { FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';
import { MarketCmd, type MarketCommand } from './MarketCommands.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';
import { CandleTimeline } from '$lib/domains/market/CandleTimeline.js';

export class MarketStore extends BaseStore {

    bid = $state(0);
    offer = $state(0);
    lastCandle = $state.raw<ChartCandle | null>(null);
    updateTrigger = $state(0);

    history = $state.raw<ChartCandle[]>([]);
    historyVersion = $state(0);
    private _prependAtVersion: Map<number, number> = new Map();

    isLoaded = $state(false);
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);
    marketStatus = $state("CLOSED");
    epic = $state("");

    private _bidTimeline = new CandleTimeline();
    private _askTimeline = new CandleTimeline();
    private _liveBidCandle: ChartCandle | null = null;
    private _liveAskCandle: ChartCandle | null = null;

    constructor() {
        super();
    }

    get currentPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
    }

    hasBidHistory(): boolean {
        return this._bidTimeline.length > 0;
    }

    getOldestBidTime(): number {
        return this._bidTimeline.oldest()?.time ?? 0;
    }

    getNewestBidTime(): number {
        return this._bidTimeline.newest()?.time ?? 0;
    }

    getLiveBidCandle(): ChartCandle | null {
        return this._liveBidCandle;
    }

    getLiveAskCandle(): ChartCandle | null {
        return this._liveAskCandle;
    }

    consumePrependCount(version: number): number {
        const count = this._prependAtVersion.get(version) ?? 0;
        this._prependAtVersion.delete(version);
        return count;
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
        this._prependAtVersion.clear();
        this._bidTimeline.clear();
        this._askTimeline.clear();
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
        this._bidTimeline = CandleTimeline.from(bid);
        this._askTimeline = CandleTimeline.from(ask);
        this.recalcLiveState();
        this.publishHistory();
        this.updateTrigger++;
    }

    private _prependHistory(bid: ChartCandle[], ask: ChartCandle[]) {
        const addedBid = this._bidTimeline.prepend(bid);
        this._askTimeline.prepend(ask);
        this.publishHistory();
        this._prependAtVersion.set(this.historyVersion, addedBid);
        serverLog({ tag: LogEvent.PrependStamp, version: this.historyVersion, count: addedBid, totalCandles: this._bidTimeline.length });
        this.updateTrigger++;
    }

    private _mergeLatestHistory(newBid: ChartCandle[], newAsk: ChartCandle[]) {
        if (newBid.length === 0) return;
        const bidResult = this._bidTimeline.merge(newBid);
        this._askTimeline.merge(newAsk);

        if (bidResult.extended > 0) {
            serverLog({
                tag: LogEvent.TimelineMerge,
                source: 'sync',
                replaced: bidResult.replaced,
                extended: bidResult.extended,
                newestBefore: bidResult.newestBefore,
                newestAfter: bidResult.newestAfter,
            });
        }

        if (bidResult.extended > 0) {
            this.publishHistory();
            this.updateTrigger++;
        }
    }

    private _updateLive(u: FeedUpdate) {
        this.bid = u.bid;
        this.offer = u.offer;

        const hasCompletion = u.completedBid || u.completedAsk;
        if (u.completedBid) {
            const result = this._bidTimeline.append(u.completedBid);
            if (result !== 'added') {
                serverLog({ tag: LogEvent.TimelineAppend, time: u.completedBid.time, result, newestExisting: this._bidTimeline.newest()?.time ?? 0 });
            }
        }
        if (u.completedAsk) {
            this._askTimeline.append(u.completedAsk);
        }

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
        this._liveBidCandle = this._bidTimeline.newest() ?? null;
        this._liveAskCandle = this._askTimeline.newest() ?? null;

        if (this._liveBidCandle) this.bid = this._liveBidCandle.close;
        if (this._liveAskCandle) this.offer = this._liveAskCandle.close;
    }

    private publishHistory() {
        const prevCandles = this.history.length;

        if (this.dataSource === TRADING.CHART_DATA_SOURCE_OFR) {
            this.history = this._askTimeline.toArray();
            this.lastCandle = this._liveAskCandle;
        } else {
            this.history = this._bidTimeline.toArray();
            this.lastCandle = this._liveBidCandle;
        }
        this.historyVersion++;

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

    private publishLiveCandle() {
        if (this.dataSource === TRADING.CHART_DATA_SOURCE_OFR) {
            this.lastCandle = this._liveAskCandle;
        } else {
            this.lastCandle = this._liveBidCandle;
        }
    }
}

export const marketStore = new MarketStore();
