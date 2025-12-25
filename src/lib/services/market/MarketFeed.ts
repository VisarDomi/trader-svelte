import { StreamClient } from '$lib/api/stream.js';
import { CandleAggregator } from '$lib/domain/market/CandleAggregator.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { QuoteMessage, ChartCandle } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

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

    mergeExternalData(bidCandle: ChartCandle | null, askCandle: ChartCandle | null) {
        if (bidCandle) this.bidAgg.merge(bidCandle);
        if (askCandle) this.askAgg.merge(askCandle);

        this.emitSnapshot();
    }

    private processMessage(msg: QuoteMessage) {
        const p = msg.payload;
        const time = this.calculateMinuteTimestamp(p.timestamp);

        const completedBid = this.bidAgg.processTick(p.bid, time);
        const completedAsk = this.askAgg.processTick(p.ofr, time);

        this.onUpdate({
            bid: p.bid,
            offer: p.ofr,
            completedBid,
            completedAsk,
            liveBid: this.bidAgg.getLiveCandle(),
            liveAsk: this.askAgg.getLiveCandle()
        });
    }

    private emitSnapshot() {
        const liveBid = this.bidAgg.getLiveCandle();
        const liveAsk = this.askAgg.getLiveCandle();

        this.onUpdate({
            bid: liveBid?.close || 0,
            offer: liveAsk?.close || 0,
            completedBid: null,
            completedAsk: null,
            liveBid,
            liveAsk
        });
    }

    private calculateMinuteTimestamp(ms: number): UTCTimestamp {
        return (Math.floor(ms / 1000 / 60) * 60) as UTCTimestamp;
    }
}