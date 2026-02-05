import { MarketRepository } from '$lib/domains/market/repositories/MarketRepository.js';
import { MarketFeed, type FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle } from '$lib/shared/types/market.js';
import * as TRADING from '$lib/shared/constants/trading.js';

export class MarketDataPump {
    private feed: MarketFeed;
    private epic: string = "";
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private lastSyncMinute = -1;

    constructor() {
        // Feed is "Internal" to the pump, pushing data to the passive store
        this.feed = new MarketFeed((update) => this.handleFeedUpdate(update));
    }

    /**
     * Initial Load: Fetches history via HTTP and populates the Store.
     * Does NOT start the stream (SystemController does that).
     */
    async load(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        this.epic = epic;

        // Reset store state for new epic
        marketStore.reset(dataSource);

        const client = api.client;
        if (!client) return;

        try {
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistory(epic);

            // Populate Store
            marketStore.setHistory(bid, ask);

            // Seed the Feed Aggregator with the latest data
            const lastBid = bid.length > 0 ? bid[bid.length - 1] : null;
            const lastAsk = ask.length > 0 ? ask[ask.length - 1] : null;

            this.feed.initialize(lastBid, lastAsk);

            marketStore.setLoaded(true);

        } catch (e) {
            console.error('[MarketDataPump] Load failed', e);
        }
    }

    /**
     * Start the WebSocket Stream and History Sync Heartbeat
     */
    connect(targetEpic?: string) {
        if (targetEpic) this.epic = targetEpic;
        if (!this.epic) return;

        this.disconnect();

        const tokens = session.getTokens(session.mode);
        if (tokens) {
            // Re-seed feed aggregator to ensure continuity from current Store state
            // (In case we are reconnecting after a pause)
            this.feed.initialize(marketStore.liveBidCandle, marketStore.liveAskCandle);
            this.feed.connect(tokens, this.epic);
        }

        // Heartbeat: Sync history roughly at the 30s mark of a minute
        this.syncInterval = setInterval(() => {
            const now = new Date();
            const sec = now.getSeconds();

            if (sec >= 30 && sec <= 35 && this.lastSyncMinute !== now.getMinutes()) {
                this.lastSyncMinute = now.getMinutes();
                void this.syncHistory();
            }
        }, 1000);
    }

    disconnect() {
        this.feed.disconnect();
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    private handleFeedUpdate(u: FeedUpdate) {
        // Push raw data to the passive store
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

            // Update Store History (overwrite with authoritative server data)
            marketStore.setHistory(bidData.history, askData.history);

            // Merge the "current" partial candle from server into our local aggregator
            this.feed.mergeExternalData(bidData.current, askData.current);

        } catch (e) {
            console.warn("[MarketDataPump] History sync failed", e);
        }
    }
}

export const marketDataPump = new MarketDataPump();