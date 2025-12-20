import type { ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { connectToStream } from "$lib/services/stream.js";
import { getHistoricalPrices } from "$lib/services/market.js";
import type { SessionTokens } from "$lib/types/auth.js";
import type { QuoteMessage, ChartCandle } from "$lib/types/market.js";
import * as TRADING from "$lib/constants/trading.js";

export class ChartFeed {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private stream: { destroy: () => void } | null = null;
    private historicalLoaded = false;
    private liveBuffer: QuoteMessage[] = [];
    private currentCandle: ChartCandle | null = null;
    private dataSource = TRADING.CHART_DATA_SOURCE_BID;

    // Expose live quotes for UI interaction
    currentBid = $state(0);
    currentOfr = $state(0);

    async init(
        tokens: SessionTokens,
        epic: string,
        series: ISeriesApi<"Candlestick">,
        dataSource: typeof TRADING.CHART_DATA_SOURCE_BID | typeof TRADING.CHART_DATA_SOURCE_OFR
    ) {
        this.series = series;
        this.dataSource = dataSource;

        // 1. Connect Stream immediately to start buffering and getting live quotes
        this.stream = connectToStream(tokens, epic, (msg) => this.handleStreamMessage(msg));

        // 2. Load History (using the specific data source: Bid or Ofr/Ask)
        const data = await getHistoricalPrices(tokens, epic, dataSource);

        this.series.setData(data);
        if (data.length > 0) {
            this.currentCandle = data[data.length - 1];
            // Init live values from history close if stream hasn't hit yet
            if (this.currentBid === 0) this.currentBid = this.currentCandle.close;
            if (this.currentOfr === 0) this.currentOfr = this.currentCandle.close;
        }

        this.historicalLoaded = true;
        this.processBuffer();
    }

    destroy() {
        if (this.stream) {
            this.stream.destroy();
            this.stream = null;
        }
    }

    private handleStreamMessage(msg: QuoteMessage) {
        this.currentBid = msg.payload.bid;
        this.currentOfr = msg.payload.ofr;

        if (!this.historicalLoaded) {
            this.liveBuffer.push(msg);
        } else {
            // Choose which price to chart based on configured mode
            const price = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? msg.payload.ofr : msg.payload.bid;
            this.processTick(price, msg.payload.timestamp);
        }
    }

    private processBuffer() {
        for (const msg of this.liveBuffer) {
            this.currentBid = msg.payload.bid;
            this.currentOfr = msg.payload.ofr;

            const price = this.dataSource === TRADING.CHART_DATA_SOURCE_OFR ? msg.payload.ofr : msg.payload.bid;
            this.processTick(price, msg.payload.timestamp);
        }
        this.liveBuffer = [];
    }

    private processTick(price: number, timestampMs: number) {
        if (!this.series) return;
        const time = (Math.floor(timestampMs / 1000 / 60) * 60) as UTCTimestamp;
        if (!this.currentCandle) {
            this.currentCandle = { time, open: price, high: price, low: price, close: price };
        } else if (time === this.currentCandle.time) {
            this.currentCandle.high = Math.max(this.currentCandle.high, price);
            this.currentCandle.low = Math.min(this.currentCandle.low, price);
            this.currentCandle.close = price;
        } else if (time > this.currentCandle.time) {
            this.currentCandle = {
                time,
                open: price,
                high: price,
                low: price,
                close: price
            };
        }
        this.series.update(this.currentCandle);
    }
}