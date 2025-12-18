import type { ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { connectToStream } from "$lib/services/stream.js";
import { getHistoricalPrices } from "$lib/services/market.js";
import type { SessionTokens } from "$lib/types/auth.js";
import type { QuoteMessage, ChartCandle } from "$lib/types/market.js";

export class ChartFeed {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private stream: { destroy: () => void } | null = null;
    private historicalLoaded = false;
    private liveBuffer: QuoteMessage[] = [];
    private currentCandle: ChartCandle | null = null;

    async init(tokens: SessionTokens, epic: string, series: ISeriesApi<"Candlestick">) {
        this.series = series;
        this.stream = connectToStream(tokens, epic, (msg) => this.handleStreamMessage(msg));
        const data = await getHistoricalPrices(tokens, epic);
        this.series.setData(data);
        if (data.length > 0) {
            this.currentCandle = data[data.length - 1];
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
        if (!this.historicalLoaded) {
            this.liveBuffer.push(msg);
        } else {
            this.processTick(msg.payload.bid, msg.payload.timestamp);
        }
    }

    private processBuffer() {
        for (const msg of this.liveBuffer) {
            this.processTick(msg.payload.bid, msg.payload.timestamp);
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