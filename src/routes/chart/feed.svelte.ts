import { connectToStream } from "$lib/services/stream";
import { getHistoricalPrices } from "$lib/services/market";
import type { SessionTokens } from "$lib/types/auth";
import type { QuoteMessage, ChartCandle } from "$lib/types/market";
import type { ISeriesApi, UTCTimestamp } from "lightweight-charts";

export class ChartFeed {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private stream: { destroy: () => void } | null = null;

    // Data State
    private historicalLoaded = false;
    private liveBuffer: QuoteMessage[] = [];
    private currentCandle: ChartCandle | null = null;

    async init(tokens: SessionTokens, epic: string, series: ISeriesApi<"Candlestick">) {
        this.series = series;

        // 1. Connect WS immediately to buffer live ticks
        this.stream = connectToStream(tokens, epic, (msg) => this.handleStreamMessage(msg));

        // 2. Fetch History
        const data = await getHistoricalPrices(tokens, epic);

        // 3. Set History
        this.series.setData(data);
        if (data.length > 0) {
            this.currentCandle = data[data.length - 1];
        }

        this.historicalLoaded = true;

        // 4. Replay Buffer
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

        // Round to nearest minute
        const time = (Math.floor(timestampMs / 1000 / 60) * 60) as UTCTimestamp;

        if (!this.currentCandle) {
            // New candle (start of chart)
            this.currentCandle = { time, open: price, high: price, low: price, close: price };
        } else if (time === this.currentCandle.time) {
            // Update existing candle
            this.currentCandle.high = Math.max(this.currentCandle.high, price);
            this.currentCandle.low = Math.min(this.currentCandle.low, price);
            this.currentCandle.close = price;
        } else if (time > this.currentCandle.time) {
            // Create new candle
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