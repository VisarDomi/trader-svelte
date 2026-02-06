import { MarketRepository } from '$lib/domains/market/repositories/MarketRepository.js';
import { MarketFeed, type FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle } from '$lib/shared/types/market.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import type { UTCTimestamp } from 'lightweight-charts';

const STALE_THRESHOLD_MS = 10000;
const LIVENESS_CHECK_INTERVAL = 2000;

// Direct Interface for the Chart Controller to allow synchronous updates
type ChartPrependCallback = (data: ChartCandle[], offset: number) => void;

/**
 * ARCHITECTURE NOTE:
 * This class bypasses the standard Svelte reactivity loop for performance.
 *
 * It uses a direct 'chartAdapter' callback to inject history into the chart
 * synchronously. This is required to prevent scroll-glitching on iOS.
 *
 * DO NOT REFACTOR TO USE STORES FOR HISTORICAL DATA INJECTION.
 */
export class MarketDataPump {
    private feed: MarketFeed;
    private epic: string = "";

    // Sync State
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private livenessInterval: ReturnType<typeof setInterval> | null = null;
    private lastSyncMinute = -1;

    // Infinite Scroll State
    isLoadingHistory = false;
    isHistoryExhausted = false;

    // Direct Pipe to Chart Controller (Architecture Bypass)
    private chartAdapter: ChartPrependCallback | null = null;

    constructor() {
        this.feed = new MarketFeed((update) => this.handleFeedUpdate(update));
    }

    /**
     * Registers a callback to the UI layer (ChartController).
     * This allows the pump to perform atomic visual updates when loading history,
     * bypassing the slower Svelte reactivity loop.
     */
    registerChartAdapter(callback: ChartPrependCallback) {
        this.chartAdapter = callback;
    }

    unregisterChartAdapter() {
        this.chartAdapter = null;
    }

    async load(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        this.epic = epic;
        this.isHistoryExhausted = false; // Reset flag

        marketStore.reset(dataSource);

        const client = api.client;
        if (!client) return;

        try {
            const repo = new MarketRepository(client);
            // New "Latest" fetch
            const { bid, ask } = await repo.getHistory(epic);

            marketStore.setHistory(bid, ask);

            const lastBid = bid.length > 0 ? bid[bid.length - 1] : null;
            const lastAsk = ask.length > 0 ? ask[ask.length - 1] : null;

            this.feed.initialize(lastBid, lastAsk);
            marketStore.setLoaded(true);

        } catch (e) {
            console.error('[MarketDataPump] Load failed', e);
        }
    }

    /**
     * Called by HistoryLoaderPlugin when scrolling back
     */
    async loadMoreHistory() {
        if (this.isLoadingHistory || this.isHistoryExhausted || !this.epic) return;

        // 1. Get Anchor (Oldest Candle)
        if (marketStore.bidHistory.length === 0) return;

        const anchorTime = marketStore.bidHistory[0].time;
        const requestTime = (anchorTime - 60) as UTCTimestamp;

        this.isLoadingHistory = true;
        const client = api.client;

        if (!client) {
            this.isLoadingHistory = false;
            return;
        }

        console.log(`[MarketDataPump] Triggering history fetch. Anchor: ${anchorTime}`);

        try {
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistoryBefore(this.epic, requestTime);

            if (bid.length === 0 && ask.length === 0) {
                this.isHistoryExhausted = true;
            } else {
                const filteredBid = bid.filter(c => c.time < anchorTime);
                const filteredAsk = ask.filter(c => c.time < anchorTime);

                if (filteredBid.length === 0) {
                    this.isHistoryExhausted = true;
                } else {
                    console.log(`[MarketDataPump] Prepending ${filteredBid.length} new candles.`);

                    // 1. Update State (Reactive Store)
                    marketStore.prependHistory(filteredBid, filteredAsk);

                    // 2. Direct Visual Update (Synchronous)
                    // We invoke this IMMEDIATELY after state update to fix the scroll position
                    // before the browser paints the "Index 0" glitch.
                    if (this.chartAdapter) {
                        const activeHistory = marketStore.history; // Get the newly merged full list
                        this.chartAdapter(activeHistory, filteredBid.length);
                    }
                }
            }

        } catch (e) {
            console.warn("[MarketDataPump] LoadMore failed", e);
        } finally {
            this.isLoadingHistory = false;
        }
    }

    connect(targetEpic?: string) {
        if (targetEpic) this.epic = targetEpic;
        if (!this.epic) return;

        this.disconnect();

        const tokens = session.getTokens(session.mode);
        if (tokens) {
            this.feed.initialize(marketStore.liveBidCandle, marketStore.liveAskCandle);
            this.feed.connect(tokens, this.epic);
        }

        this.startHistorySync();
        this.startLivenessCheck();
    }

    disconnect() {
        this.feed.disconnect();
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
            const now = new Date();
            const sec = now.getSeconds();
            // Sync roughly every minute at the 30s mark
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
                console.warn(`[MarketDataPump] Zombie socket detected (Gap: ${gap}ms). Restarting...`);
                this.connect();
            }
        }, LIVENESS_CHECK_INTERVAL);
    }

    private handleFeedUpdate(u: FeedUpdate) {
        marketStore.updateLive(u);
    }

    private async syncHistory() {
        if (!this.epic || !marketStore.isLoaded) return;
        const client = api.client;
        if (!client) return;

        try {
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistory(this.epic);

            const split = (arr: ChartCandle[]) => {
                if (arr.length === 0) return { history: [], current: null };
                const current = arr[arr.length - 1];
                const history = arr.slice(0, -1);
                return { history, current };
            };

            const bidData = split(bid);
            const askData = split(ask);

            marketStore.mergeLatestHistory(bidData.history, askData.history);
            this.feed.mergeExternalData(bidData.current, askData.current);

        } catch (e) {
            console.warn("[MarketDataPump] History sync failed", e);
        }
    }
}

export const marketDataPump = new MarketDataPump();