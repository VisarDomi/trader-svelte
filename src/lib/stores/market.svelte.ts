import { BaseStore } from '$lib/core/BaseStore.svelte.js';
import { MarketRepository } from '../repositories/MarketRepository.ts';
import { MarketFeed, type FeedUpdate } from '../services/market/MarketFeed.ts';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import * as TRADING from '$lib/constants/trading.js';
import type { ChartData } from '$lib/types/trading.js';
import type { ChartCandle } from '$lib/types/market.js';

export class MarketStore extends BaseStore {
    // --- Public State (Runes) ---
    bid = $state(0);
    offer = $state(0);
    lastCandle = $state.raw<ChartCandle | null>(null);
    updateTrigger = $state(0);
    history = $state.raw<ChartCandle[]>([]);

    // "isLoaded" implies data + stream ready, distinct from BaseStore "isLoading"
    isLoaded = $state(false);

    // --- Configuration ---
    epic = $state("");
    dataSource = $state<ChartData>(TRADING.CHART_DATA_SOURCE_BID);

    // --- Dependencies ---
    private feed: MarketFeed;
    private bidHistory: ChartCandle[] = [];
    private askHistory: ChartCandle[] = [];
    private liveBidCandle: ChartCandle | null = null;
    private liveAskCandle: ChartCandle | null = null;

    constructor() {
        super();
        this.feed = new MarketFeed((update) => this.handleFeedUpdate(update));
    }

    get currentPrice() {
        return this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? this.offer : this.bid;
    }

    async init(epic: string, dataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID) {
        this.resetState();
        this.epic = epic;
        this.dataSource = dataSource;

        const client = this.getClient();
        const tokens = session.getTokens(session.mode);

        if (!client || !tokens) return;

        // Use BaseStore execute to handle loading/error state
        await this.execute(async () => {
            const repo = new MarketRepository(client);
            const { bid, ask } = await repo.getHistory(epic);

            this.bidHistory = bid;
            this.askHistory = ask;

            // Seed internal state from history end
            this.liveBidCandle = this.bidHistory.length > 0 ? this.bidHistory[this.bidHistory.length - 1] : null;
            this.liveAskCandle = this.askHistory.length > 0 ? this.askHistory[this.askHistory.length - 1] : null;

            if (this.liveBidCandle) this.bid = this.liveBidCandle.close;
            if (this.liveAskCandle) this.offer = this.liveAskCandle.close;

            // Init Feed
            this.feed.initialize(this.liveBidCandle, this.liveAskCandle);
            this.feed.connect(tokens, epic);

            this.syncViewToSource();
            this.isLoaded = true;
        });
    }

    async syncHistory() {
        if (!this.epic || !this.isLoaded) return;
        const client = this.getClient();
        if (!client) return;

        // We do NOT use this.execute() here because this runs in the background (heartbeat).
        // Triggering global isLoading (spinner) every minute would disturb the user.
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

    disconnect() {
        this.feed.disconnect();
        this.isLoaded = false;
    }

    private resetState() {
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