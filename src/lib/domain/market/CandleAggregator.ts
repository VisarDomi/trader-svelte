import type { ChartCandle } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

export class CandleAggregator {
    // The "Working" candle. We mutate this in place.
    private liveCandle: ChartCandle | null = null;

    /**
     * Seeds the aggregator with an initial state (e.g. from history load).
     * We create a copy to ensure we don't mutate the history array passed in.
     */
    seed(candle: ChartCandle | null) {
        if (candle) {
            this.liveCandle = { ...candle };
        } else {
            this.liveCandle = null;
        }
    }

    /**
     * Updates the current candle state in-place to save allocations.
     * Returns a new ChartCandle object ONLY if a minute bar just completed (closed).
     * Otherwise returns null.
     */
    processTick(price: number, time: UTCTimestamp): ChartCandle | null {
        // 1. No state? Start new.
        if (!this.liveCandle) {
            this.liveCandle = this.createCandle(time, price);
            return null;
        }

        // 2. New Minute? Close previous, start new.
        if (time > this.liveCandle.time) {
            // Create a COPY of the finished candle to return (for history persistence)
            const completed = { ...this.liveCandle };

            // Reuse the existing liveCandle object for the new minute
            this.liveCandle.time = time;
            this.liveCandle.open = price;
            this.liveCandle.high = price;
            this.liveCandle.low = price;
            this.liveCandle.close = price;

            return completed;
        }

        // 3. Same Minute? Mutate in place.
        // Update High
        if (price > this.liveCandle.high) {
            this.liveCandle.high = price;
        }
        // Update Low
        else if (price < this.liveCandle.low) {
            this.liveCandle.low = price;
        }
        // Update Close (Always)
        this.liveCandle.close = price;

        return null;
    }

    /**
     * Returns the current live candle reference for drawing.
     * WARNING: This object is mutable. Do not store it in history arrays.
     */
    getLiveCandle(): ChartCandle | null {
        return this.liveCandle;
    }

    private createCandle(time: UTCTimestamp, price: number): ChartCandle {
        return {
            time,
            open: price,
            high: price,
            low: price,
            close: price
        };
    }
}