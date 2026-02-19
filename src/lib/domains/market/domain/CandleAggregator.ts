import type { ChartCandle } from '$lib/shared/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

export class CandleAggregator {
    private liveCandle: ChartCandle | null = null;

    // true when the candle was created by a live tick (rollover/startNew).
    // false when seeded from API data. Tick-built candles are authoritative —
    // server data should not overwrite them.
    private tickBuilt = false;

    seed(candle: ChartCandle | null) {
        if (candle) {
            this.liveCandle = { ...candle };
        } else {
            this.liveCandle = null;
        }
        this.tickBuilt = false;
    }

    /**
     * Merges server data into the live candle.
     * Returns true if the candle was actually modified.
     */
    merge(external: ChartCandle): boolean {
        if (!this.liveCandle) {
            this.liveCandle = { ...external };
            return true;
        }

        if (this.isSameMinute(this.liveCandle, external)) {
            // Tick-built candles are the source of truth — skip merge
            if (this.tickBuilt) return false;
            this.mergeCandleState(external);
            return true;
        } else if (external.time > this.liveCandle.time) {
            this.liveCandle = { ...external };
            this.tickBuilt = false;
            return true;
        }

        return false;
    }

    processTick(price: number, time: UTCTimestamp): ChartCandle | null {
        if (!this.liveCandle) {
            this.startNewCandle(time, price);
            this.tickBuilt = true;
            return null;
        }

        if (time > this.liveCandle.time) {
            const completed = this.rolloverCandle(time, price);
            this.tickBuilt = true;
            return completed;
        }

        this.updateCandleHighLow(price);
        return null;
    }

    getLiveCandle(): ChartCandle | null {
        return this.liveCandle;
    }

    private startNewCandle(time: UTCTimestamp, price: number) {
        this.liveCandle = {
            time,
            open: price,
            high: price,
            low: price,
            close: price
        };
    }

    private rolloverCandle(time: UTCTimestamp, price: number): ChartCandle {
        const completedCandle = { ...this.liveCandle! };

        this.liveCandle!.time = time;
        this.liveCandle!.open = price;
        this.liveCandle!.high = price;
        this.liveCandle!.low = price;
        this.liveCandle!.close = price;

        return completedCandle;
    }

    private updateCandleHighLow(price: number) {
        if (!this.liveCandle) return;

        if (price > this.liveCandle.high) {
            this.liveCandle.high = price;
        } else if (price < this.liveCandle.low) {
            this.liveCandle.low = price;
        }
        this.liveCandle.close = price;
    }

    private isSameMinute(a: ChartCandle, b: ChartCandle): boolean {
        return a.time === b.time;
    }

    /**
     * Merges server candle into a seeded (non-tick-built) live candle.
     * Server has the authoritative open (from minute start).
     * High/low take the best of both sources.
     * Close is untouched — latest tick is always more current.
     */
    private mergeCandleState(external: ChartCandle) {
        if (!this.liveCandle) return;

        this.liveCandle.open = external.open;
        this.liveCandle.high = Math.max(this.liveCandle.high, external.high);
        this.liveCandle.low = Math.min(this.liveCandle.low, external.low);
    }
}
