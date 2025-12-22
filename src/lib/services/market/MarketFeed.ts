import { StreamClient } from '$lib/api/stream.js';
import { CandleAggregator, type AggregationResult } from '$lib/domain/market/CandleAggregator.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { QuoteMessage } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';
import type { ChartCandle } from '$lib/types/market.js';

export interface FeedTick {
    bid: number;
    offer: number;
    time: UTCTimestamp;
}

export interface FeedUpdate {
    tick: FeedTick;
    bidResult: AggregationResult;
    askResult: AggregationResult;
}

export class MarketFeed {
    private stream: StreamClient | null = null;
    private aggregator = new CandleAggregator();

    // Track live candles internally to perform aggregation
    private liveBid: ChartCandle | null = null;
    private liveAsk: ChartCandle | null = null;

    constructor(
        private readonly onUpdate: (update: FeedUpdate) => void
    ) {}

    /**
     * Seeds the aggregator with the initial state from history
     * so the next tick calculates correctly.
     */
    initialize(lastBidCandle: ChartCandle | null, lastAskCandle: ChartCandle | null) {
        this.liveBid = lastBidCandle;
        this.liveAsk = lastAskCandle;
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
        this.liveBid = null;
        this.liveAsk = null;
    }

    private processMessage(msg: QuoteMessage) {
        const tick: FeedTick = {
            bid: msg.payload.bid,
            offer: msg.payload.ofr,
            // Round to nearest minute for candle aggregation
            time: (Math.floor(msg.payload.timestamp / 1000 / 60) * 60) as UTCTimestamp
        };

        // 1. Aggregate Bid
        const bidResult = this.aggregator.processTick(this.liveBid, tick.bid, tick.time);
        this.liveBid = bidResult.liveCandle;

        // 2. Aggregate Ask
        const askResult = this.aggregator.processTick(this.liveAsk, tick.offer, tick.time);
        this.liveAsk = askResult.liveCandle;

        // 3. Emit
        this.onUpdate({
            tick,
            bidResult,
            askResult
        });
    }
}