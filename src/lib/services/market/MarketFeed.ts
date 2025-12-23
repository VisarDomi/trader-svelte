import { StreamClient } from '$lib/api/stream.js';
import { CandleAggregator } from '$lib/domain/market/CandleAggregator.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { QuoteMessage, ChartCandle } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

// Interface carries the mutable live references and the immutable completed copies
export interface FeedUpdate {
    bid: number;
    offer: number;
    completedBid: ChartCandle | null;
    completedAsk: ChartCandle | null;
    liveBid: ChartCandle | null;
    liveAsk: ChartCandle | null;
}

export class MarketFeed {
    private stream: StreamClient | null = null;

    private bidAgg = new CandleAggregator();
    private askAgg = new CandleAggregator();

    constructor(
        private readonly onUpdate: (update: FeedUpdate) => void
    ) {}

    initialize(lastBidCandle: ChartCandle | null, lastAskCandle: ChartCandle | null) {
        this.bidAgg.seed(lastBidCandle);
        this.askAgg.seed(lastAskCandle);
    }

    connect(tokens: SessionTokens, epic: string) {
        if (this.stream) return;

        this.stream = new StreamClient(tokens, epic, (msg) => this.processMessage(msg));
        this.stream.connect();
    }

    disconnect() {
        if (this.stream) {
            this.stream.disconnect();
            this.stream = null;
        }
    }

    /**
     * Merges authoritative external data (REST) into the live aggregators.
     */
    mergeExternalData(bidCandle: ChartCandle | null, askCandle: ChartCandle | null) {
        if (bidCandle) this.bidAgg.merge(bidCandle);
        if (askCandle) this.askAgg.merge(askCandle);

        // Immediately emit an update to reflect the merge on the chart
        this.onUpdate({
            bid: bidCandle?.close || 0, // Fallback if no ticks yet
            offer: askCandle?.close || 0,
            completedBid: null,
            completedAsk: null,
            liveBid: this.bidAgg.getLiveCandle(),
            liveAsk: this.askAgg.getLiveCandle()
        });
    }

    private processMessage(msg: QuoteMessage) {
        const p = msg.payload;

        // Round timestamp to minute floor
        const time = (Math.floor(p.timestamp / 1000 / 60) * 60) as UTCTimestamp;

        // 1. Process Aggregation (Mutates internal state, returns copy only if closed)
        const completedBid = this.bidAgg.processTick(p.bid, time);
        const completedAsk = this.askAgg.processTick(p.ofr, time);

        // 2. Emit result
        this.onUpdate({
            bid: p.bid,
            offer: p.ofr,
            completedBid,
            completedAsk,
            liveBid: this.bidAgg.getLiveCandle(),
            liveAsk: this.askAgg.getLiveCandle()
        });
    }
}