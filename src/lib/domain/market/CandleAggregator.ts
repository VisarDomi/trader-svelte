import type { ChartCandle } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

export interface AggregationResult {
    completedCandle: ChartCandle | null; // If a minute finished, this is the closed candle
    liveCandle: ChartCandle;             // The current active candle state
}

export class CandleAggregator {
    /**
     * Updates the current candle with a new price tick or creates a new one if time advanced.
     */
    processTick(
        currentCandle: ChartCandle | null,
        price: number,
        time: UTCTimestamp
    ): AggregationResult {
        // Case 1: First tick of the session
        if (!currentCandle) {
            return {
                completedCandle: null,
                liveCandle: this.createCandle(time, price)
            };
        }

        // Case 2: Time moved forward (New Minute)
        if (time > currentCandle.time) {
            return {
                completedCandle: { ...currentCandle }, // Close previous
                liveCandle: this.createCandle(time, price) // Start new
            };
        }

        // Case 3: Update existing candle (High/Low logic)
        return {
            completedCandle: null,
            liveCandle: {
                time: currentCandle.time,
                open: currentCandle.open,
                high: Math.max(currentCandle.high, price),
                low: Math.min(currentCandle.low, price),
                close: price
            }
        };
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