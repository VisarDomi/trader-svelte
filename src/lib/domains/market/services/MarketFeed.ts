import { StreamClient } from '$lib/domains/market/api/StreamClient.js';
import { CandleAggregator } from '$lib/domains/market/domain/CandleAggregator.js';
import type { SessionTokens } from '$lib/shared/types/auth.js';
import type { QuoteMessage, ChartCandle } from '$lib/shared/types/market.js';
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

    // Heartbeat Tracking
    public lastUpdateTimestamp = 0;

    private bidAgg = new CandleAggregator();
    private askAgg = new CandleAggregator();

    constructor(
        private readonly onUpdate: (update: FeedUpdate) => void
    ) {}

    initialize(lastBidCandle: ChartCandle | null, lastAskCandle: ChartCandle | null) {
        this.bidAgg.seed(lastBidCandle);
        this.askAgg.seed(lastAskCandle);
        // Reset heartbeat on init
        this.lastUpdateTimestamp = Date.now();
    }

    connect(tokens: SessionTokens, epic: string) {
        if (this.stream) return;

        this.lastUpdateTimestamp = Date.now();
        this.stream = new StreamClient(tokens, epic, (msg) => this.processMessage(msg));
        this.stream.connect();
    }

    disconnect() {
        if (this.stream) {
            this.stream.disconnect();
            this.stream = null;
        }
    }

    getLiveBidSnapshot(): ChartCandle | null {
        const c = this.bidAgg.getLiveCandle();
        return c ? { ...c } : null;
    }

    mergeExternalData(bidCandle: ChartCandle | null, askCandle: ChartCandle | null) {
        let changed = false;
        if (bidCandle) changed = this.bidAgg.merge(bidCandle) || changed;
        if (askCandle) changed = this.askAgg.merge(askCandle) || changed;

        if (changed) this.emitSnapshot();
    }

    private processMessage(msg: QuoteMessage) {
        this.lastUpdateTimestamp = Date.now();

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