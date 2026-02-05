import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { MarketRepository } from '$lib/domains/market/repositories/MarketRepository.js';
import { MarketFeed, type FeedUpdate } from '$lib/domains/market/services/MarketFeed.js';
import { session } from '$lib/core/services/SessionManager.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import type { ChartData } from '$lib/shared/types/trading.js';
import type { ChartCandle } from '$lib/shared/types/market.js';

export class MarketStore extends BaseStore {
    bid = $state(0);
    offer = $state(0);
    lastCandle = $state.raw<ChartCandle | null>(null);
    updateTrigger = $state(0);
    history = $state.raw<ChartCandle[]>([]);
    isLoaded = $state(false);

    epic = $state("");
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);

    private feed: MarketFeed;
    private bidHistory: ChartCandle[] = [];
    private askHistory: ChartCandle[] = [];
    private liveBidCandle: ChartCandle | null = null;
    private liveAskCandle: ChartCandle | null = null;

    // Track sync state
    private lastSyncMinute = -1;
    private syncInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        super();
        this.feed = new MarketFeed((update) => this.handleFeedUpdate(update));
        // NOTE: Auto-connect $effect removed. We now rely on explicit connect() calls.
    }

    /**
     * COMMAND: Connect to the stream.
     * Called explicitly by SystemController.
     */
    connect(targetEpic?: string) {
        if (targetEpic) this.epic = targetEpic;
        if (!this.epic) return;

        // 1. Ensure any previous connection is cleaned up
        this.disconnect();

        // 2. Connect Feed
        const tokens = session.getTokens(session.mode);
        if (tokens) {
            // Re-seed feed to ensure continuity
            this.feed.initialize(this.liveBidCandle, this.liveAskCandle);
            this.feed.connect(tokens, this.epic);
        }

        // 3. Start History Sync Heartbeat
        // Sync roughly at the 30s mark of a minute, once per minute
        this.syncInterval = setInterval(() => {
            const now = new Date();
            const sec = now.getSeconds();

            if (sec >= 30 && sec <= 35 && this.lastSyncMinute !== now.getMinutes()) {
                this.lastSyncMinute = now.getMinutes();
                void this.syncHistory();
            }
        }, 1000);
    }

    /**
     * COMMAND: Disconnect from the stream.
     * Called explicitly by SystemController.
     */
    disconnect() {
        this.feed.disconnect();
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    get currentPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
    }

    async load(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        if (this.epic !== epic) {
            this.resetState();
            this.epic = epic;
        }

        this.dataSource = dataSource;

        const client = this.getClient();
        if (!client) return;

        await this.execute(async () => {
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistory(epic);

            this.bidHistory = bid;
            this.askHistory = ask;

            this.liveBidCandle = this.bidHistory.length > 0 ? this.bidHistory[this.bidHistory.length - 1] : null;
            this.liveAskCandle = this.askHistory.length > 0 ? this.askHistory[this.askHistory.length - 1] : null;

            if (this.liveBidCandle) this.bid = this.liveBidCandle.close;
            if (this.liveAskCandle) this.offer = this.liveAskCandle.close;

            this.syncViewToSource();
            this.isLoaded = true;
        });

        // Handoff to AppEngine/SystemController to decide if we should connect immediately
        // In a "Command" architecture, we can inspect global state or wait for a specific call.
        // For robustness, we check if we are *likely* in a tradeable state:
        import('$lib/core/engine/AppEngine.svelte.js').then(({ appEngine }) => {
            if (appEngine.status === 'READY') {
                this.connect();
            }
        });
    }

    async syncHistory() {
        if (!this.epic || !this.isLoaded) return;
        const client = this.getClient();
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

            this.bidHistory = bidData.history;
            this.askHistory = askData.history;

            this.syncViewToSource();
            this.feed.mergeExternalData(bidData.current, askData.current);
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

    private resetState() {
        this.disconnect();
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
        this.lastSyncMinute = -1;
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

        if (u.completedBid) this.bidHistory.push(u.completedBid);
        if (u.completedAsk) this.askHistory.push(u.completedAsk);

        this.liveBidCandle = u.liveBid;
        this.liveAskCandle = u.liveAsk;

        if (this.isLoaded) {
            this.lastCandle = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR
                ? this.liveAskCandle
                : this.liveBidCandle;

            this.updateTrigger++;
        }
    }
}

export const marketStore = new MarketStore();