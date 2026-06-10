import { MarketRepository } from '$lib/domains/market/repositories/MarketRepository.js';
import { MarketFeed, type FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { marketCmd } from '$lib/domains/market/stores/MarketCommands.js';
import { session } from '$lib/core/services/SessionManager.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle, CandleFrame } from '$lib/shared/types/market.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import type { UTCTimestamp } from 'lightweight-charts';
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';
import { log, serverLog, LogEvent } from '$lib/shared/utils/log.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import { candleCache } from '$lib/domains/market/services/CandleCache.js';

const STALE_THRESHOLD_MS = 10000;
const LIVENESS_CHECK_INTERVAL = 2000;

export class MarketDataPump {
    private feed: MarketFeed;
    private epic: string = "";

    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private livenessInterval: ReturnType<typeof setInterval> | null = null;
    private abortController: AbortController | null = null;
    private lastSyncMinute = -1;
    private pendingSyncOnTick = false;
    private syncInProgress = false;
    private hasPreviousBarGap = false;

    isLoadingHistory = false;
    isHistoryExhausted = false;

    constructor() {
        this.feed = new MarketFeed((update) => this.handleFeedUpdate(update));
    }

    async load(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        this.epic = epic;
        this.isHistoryExhausted = false;

        marketStore.dispatch(marketCmd.reset(dataSource));

        const client = api.client;
        if (!client) return;

        try {
            const cached = await candleCache.get(epic);
            const repo = new MarketRepository(client);

            if (cached && cached.length > 0) {
                const cachedNewest = cached[cached.length - 1].time;
                const { bid, ask } = await repo.getHistory(epic);

                const newBid = bid.filter(c => c.time > cachedNewest);
                const mergedBid = [...cached, ...newBid];

                marketStore.dispatch(marketCmd.setHistory(mergedBid, ask));
                void candleCache.put(epic, mergedBid);

                const lastBid = mergedBid[mergedBid.length - 1];
                const lastAsk = ask.length > 0 ? ask[ask.length - 1] : null;
                this.feed.initialize(lastBid, lastAsk);
            } else {
                const { bid, ask } = await repo.getHistory(epic);

                marketStore.dispatch(marketCmd.setHistory(bid, ask));
                void candleCache.put(epic, bid);

                const lastBid = bid.length > 0 ? bid[bid.length - 1] : null;
                const lastAsk = ask.length > 0 ? ask[ask.length - 1] : null;
                this.feed.initialize(lastBid, lastAsk);
            }

            marketStore.dispatch(marketCmd.setLoaded(true));

        } catch (e) {
            log.error('[MarketDataPump] Load failed', e);
        }
    }

    async loadMoreHistory() {
        if (this.isLoadingHistory || this.isHistoryExhausted || !this.epic) return;

        if (!marketStore.hasBidHistory()) return;

        const anchorTime = marketStore.getOldestBidTime();
        const requestTime = (anchorTime - 60) as UTCTimestamp;

        this.isLoadingHistory = true;
        const client = api.client;

        if (!client) {
            this.isLoadingHistory = false;
            return;
        }

        try {
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistoryBefore(this.epic, requestTime, this.abortController?.signal);

            if (bid.length === 0 && ask.length === 0) {
                this.isHistoryExhausted = true;
            } else {
                const filteredBid = bid.filter(c => c.time < anchorTime);
                const filteredAsk = ask.filter(c => c.time < anchorTime);

                if (filteredBid.length === 0) {
                    this.isHistoryExhausted = true;
                } else {
                    marketStore.dispatch(marketCmd.prependHistory(filteredBid, filteredAsk));
                    void candleCache.put(this.epic, marketStore.history);
                }
            }

        } catch (e) {
            log.warn("[MarketDataPump] LoadMore failed", e);
        } finally {
            this.isLoadingHistory = false;
        }
    }

    requestSyncOnNextTick() {
        this.pendingSyncOnTick = true;
    }

    connect(targetEpic?: string) {
        if (targetEpic) this.epic = targetEpic;
        if (!this.epic) {
            serverLog({ tag: LogEvent.ConnectAbort, reason: 'no-epic', epic: '' });
            return;
        }

        this.disconnect();
        this.syncInProgress = false;
        this.abortController = new AbortController();

        const tokens = session.getTokens(session.mode);
        if (tokens) {
            const seedBid = marketStore.getLiveBidCandle();
            const seedAsk = marketStore.getLiveAskCandle();

            const currentMinute = (Math.floor(Date.now() / 1000 / 60) * 60) as UTCTimestamp;
            const freshBid = seedBid?.time === currentMinute ? seedBid : null;
            const freshAsk = seedAsk?.time === currentMinute ? seedAsk : null;

            serverLog({
                tag: LogEvent.ConnectSeed,
                epic: this.epic,
                bidTime: seedBid?.time ?? null,
                bidOHLC: seedBid ? { o: seedBid.open, h: seedBid.high, l: seedBid.low, c: seedBid.close } : null,
                staleMs: seedBid ? Date.now() - seedBid.time * 1000 : null,
                seeded: freshBid !== null,
            });
            this.feed.initialize(freshBid, freshAsk);
            this.feed.connect(tokens, this.epic);
        } else {
            serverLog({ tag: LogEvent.ConnectAbort, reason: 'no-tokens', epic: this.epic });
        }

        this.lastSyncMinute = -1;
        this.startHistorySync();
        this.startLivenessCheck();

        this.pendingSyncOnTick = true;
    }

    disconnect() {
        this.feed.disconnect();
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        if (this.livenessInterval) {
            clearInterval(this.livenessInterval);
            this.livenessInterval = null;
        }
    }

    private startHistorySync() {
        this.syncInterval = setInterval(() => {

            if (this.hasPreviousBarGap) {
                void this.syncHistory();
                return;
            }

            const now = new Date();
            const sec = now.getSeconds();

            if (sec >= 30 && sec <= 35 && this.lastSyncMinute !== now.getMinutes()) {
                this.lastSyncMinute = now.getMinutes();
                void this.syncHistory();
            }
        }, 1000);
    }

    private startLivenessCheck() {
        this.livenessInterval = setInterval(() => {
            const now = Date.now();
            const gap = now - this.feed.lastUpdateTimestamp;

            if (gap > STALE_THRESHOLD_MS && marketStore.isLoaded && marketStore.marketStatus === 'TRADEABLE') {
                fetch('/api/tick-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'zombie', gapMs: gap, ts: Date.now() }) }).catch(()=>{});
                serverLog({ tag: LogEvent.ZombieSocket, gapMs: gap });
                this.connect();
            }
        }, LIVENESS_CHECK_INTERVAL);
    }

    private handleFeedUpdate(u: FeedUpdate) {
        if (this.pendingSyncOnTick) {
            this.pendingSyncOnTick = false;
            serverLog({
                tag: LogEvent.FirstTick,
                bid: u.bid,
                offer: u.offer,
                liveBidTime: u.liveBid?.time ?? null,
                completedBid: u.completedBid ? { time: u.completedBid.time, o: u.completedBid.open, c: u.completedBid.close } : null,
            });
            notifications.info('Syncing data...');
            void this.syncHistory();
            void positionPoller.refresh();
            void accountStore.refreshActive();
        }

        marketStore.dispatch(marketCmd.updateLive(u));

        bus.emit(EVENTS.MARKET_TICK, { bid: u.bid, offer: u.offer });
    }

    private async syncHistory() {
        if (this.syncInProgress) return;
        if (!this.epic || !marketStore.isLoaded) return;
        const client = api.client;
        if (!client) return;

        this.syncInProgress = true;

        try {
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistory(this.epic, this.abortController?.signal);

            const split = (arr: ChartCandle[]) => {
                if (arr.length === 0) return { history: [], current: null as CandleFrame | null };
                const { close: _, ...frame } = arr[arr.length - 1];
                const history = arr.slice(0, -1);
                return { history, current: frame };
            };

            const bidData = split(bid);
            const askData = split(ask);

            const historyCountBefore = marketStore.hasBidHistory() ? marketStore.getNewestBidTime() : 0;
            marketStore.dispatch(marketCmd.mergeLatestHistory(bidData.history, askData.history));
            const historyCountAfter = marketStore.hasBidHistory() ? marketStore.getNewestBidTime() : 0;

            const currentBid = bidData.current;
            const liveBefore = this.feed.getLiveBidSnapshot();
            this.feed.mergeExternalData(bidData.current, askData.current);
            const liveAfter = this.feed.getLiveBidSnapshot();

            serverLog({
                tag: LogEvent.SyncResult,
                historyCandles: bidData.history.length,
                historyExtended: historyCountAfter !== historyCountBefore,
                newestHistoryTime: historyCountAfter,
                currentFromApi: currentBid ? { time: currentBid.time, o: currentBid.open, h: currentBid.high, l: currentBid.low } : null,
                liveBefore: liveBefore ? { time: liveBefore.time, o: liveBefore.open, c: liveBefore.close } : null,
                liveAfter: liveAfter ? { time: liveAfter.time, o: liveAfter.open, c: liveAfter.close } : null,
                mergeChanged: liveBefore?.open !== liveAfter?.open || liveBefore?.high !== liveAfter?.high || liveBefore?.low !== liveAfter?.low,
            });

        } catch (e) {
            log.warn("[MarketDataPump] History sync failed", e);
        } finally {
            this.syncInProgress = false;
            this.checkForPreviousBarGap();
        }
    }

    private checkForPreviousBarGap() {
        const lastHistoryTime = marketStore.getNewestBidTime();
        const liveTime = marketStore.getLiveBidCandle()?.time ?? 0;

        const hadGap = this.hasPreviousBarGap;

        this.hasPreviousBarGap = liveTime > 0 && lastHistoryTime > 0 && (liveTime - lastHistoryTime) > 60;

        if (hadGap && !this.hasPreviousBarGap) {
            serverLog({ tag: LogEvent.BarGap, state: 'filled', historyTime: lastHistoryTime, liveTime });
        } else if (!hadGap && this.hasPreviousBarGap) {
            serverLog({ tag: LogEvent.BarGap, state: 'detected', historyTime: lastHistoryTime, liveTime });
        }
    }
}

export const marketDataPump = new MarketDataPump();
