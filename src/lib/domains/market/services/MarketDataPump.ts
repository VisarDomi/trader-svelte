import { MarketRepository } from '$lib/domains/market/repositories/MarketRepository.js';
import { MarketFeed, type FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { marketCmd } from '$lib/domains/market/stores/MarketCommands.js';
import { session } from '$lib/core/services/SessionManager.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle } from '$lib/shared/types/market.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import type { UTCTimestamp } from 'lightweight-charts';
import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { log, serverLog, LogEvent } from '$lib/shared/utils/log.js';

const STALE_THRESHOLD_MS = 10000;
const LIVENESS_CHECK_INTERVAL = 2000;

type ChartPrependCallback = (data: ChartCandle[], offset: number) => void;

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

    private chartAdapter: ChartPrependCallback | null = null;

    constructor() {
        this.feed = new MarketFeed((update) => this.handleFeedUpdate(update));
    }

    registerChartAdapter(callback: ChartPrependCallback) {
        this.chartAdapter = callback;
    }

    unregisterChartAdapter() {
        this.chartAdapter = null;
    }

    async load(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        this.epic = epic;
        this.isHistoryExhausted = false;

        marketStore.dispatch(marketCmd.reset(dataSource));

        const client = api.client;
        if (!client) return;

        try {
            const repo = new MarketRepository(client);

            const { bid, ask } = await repo.getHistory(epic);

            marketStore.dispatch(marketCmd.setHistory(bid, ask));

            const lastBid = bid.length > 0 ? bid[bid.length - 1] : null;
            const lastAsk = ask.length > 0 ? ask[ask.length - 1] : null;

            this.feed.initialize(lastBid, lastAsk);
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

        log.info(`[MarketDataPump] Triggering history fetch. Anchor: ${anchorTime}`);

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
                    log.info(`[MarketDataPump] Prepending ${filteredBid.length} new candles.`);

                    marketStore.dispatch(marketCmd.prependHistory(filteredBid, filteredAsk));

                    if (this.chartAdapter) {
                        const activeHistory = marketStore.history;
                        this.chartAdapter(activeHistory, filteredBid.length);
                    }
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
            serverLog({
                tag: LogEvent.ConnectSeed,
                epic: this.epic,
                bidTime: seedBid?.time ?? null,
                bidOHLC: seedBid ? { o: seedBid.open, h: seedBid.high, l: seedBid.low, c: seedBid.close } : null,
                staleMs: seedBid ? Date.now() - seedBid.time * 1000 : null,
            });
            this.feed.initialize(seedBid, seedAsk);
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
                log.warn(`[MarketDataPump] Zombie socket detected (Gap: ${gap}ms). Restarting...`);
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
                if (arr.length === 0) return { history: [], current: null };
                const current = arr[arr.length - 1];
                const history = arr.slice(0, -1);
                return { history, current };
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
                currentFromApi: currentBid ? { time: currentBid.time, o: currentBid.open, h: currentBid.high, l: currentBid.low, c: currentBid.close } : null,
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
            log.info('[MarketDataPump] Previous bar gap filled');
        } else if (!hadGap && this.hasPreviousBarGap) {
            log.info(`[MarketDataPump] Previous bar gap detected (history: ${lastHistoryTime}, live: ${liveTime})`);
        }
    }
}

export const marketDataPump = new MarketDataPump();
