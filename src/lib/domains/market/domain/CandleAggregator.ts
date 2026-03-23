import type { ChartCandle } from '$lib/shared/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';
import { serverLog } from '$lib/shared/utils/log.js';

export class CandleAggregator {
    private liveCandle: ChartCandle | null = null;

    seed(candle: ChartCandle | null) {
        this.liveCandle = candle ? { ...candle } : null;
    }

    /**
     * Merges server data into the live candle.
     * API open is authoritative (real minute-start price).
     * High/low take the best of both sources.
     * Close is untouched — the latest tick is always more current.
     * Returns true if the candle was actually modified.
     */
    merge(external: ChartCandle): boolean {
        if (!this.liveCandle) {
            this.liveCandle = { ...external };
            return true;
        }

        if (this.isSameMinute(this.liveCandle, external)) {
            const before = { ...this.liveCandle };
            this.mergeCandleState(external);

            const changed = before.open !== this.liveCandle.open
                || before.high !== this.liveCandle.high
                || before.low !== this.liveCandle.low;

            if (changed) {
                serverLog('candle-merge', {
                    time: this.liveCandle.time,
                    before: { o: before.open, h: before.high, l: before.low, c: before.close },
                    after: { o: this.liveCandle.open, h: this.liveCandle.high, l: this.liveCandle.low, c: this.liveCandle.close },
                });
            }
            return changed;
        } else if (external.time > this.liveCandle.time) {
            this.liveCandle = { ...external };
            return true;
        }

        return false;
    }

    processTick(price: number, time: UTCTimestamp): ChartCandle | null {
        if (!this.liveCandle) {
            this.startNewCandle(time, price);
            return null;
        }

        if (time > this.liveCandle.time) {
            return this.rolloverCandle(time, price);
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
     * API open is authoritative (first trade of the minute).
     * High/low take the best of both sources (tick may have seen extremes API hasn't reported yet, or vice versa).
     * Close is untouched — the latest tick is always more current than the API snapshot.
     */
    private mergeCandleState(external: ChartCandle) {
        if (!this.liveCandle) return;

        this.liveCandle.open = external.open;
        this.liveCandle.high = Math.max(this.liveCandle.high, external.high);
        this.liveCandle.low = Math.min(this.liveCandle.low, external.low);
    }
}
