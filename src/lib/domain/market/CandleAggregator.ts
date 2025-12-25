import type { ChartCandle } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

export class CandleAggregator {
    private liveCandle: ChartCandle | null = null;

    seed(candle: ChartCandle | null) {
        if (candle) {
            this.liveCandle = { ...candle };
        } else {
            this.liveCandle = null;
        }
    }

    merge(external: ChartCandle) {
        if (!this.liveCandle) {
            this.liveCandle = { ...external };
            return;
        }

        if (this.isSameMinute(this.liveCandle, external)) {
            this.mergeCandleState(external);
        } else if (external.time > this.liveCandle.time) {
            this.liveCandle = { ...external };
        }
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

    private mergeCandleState(external: ChartCandle) {
        if (!this.liveCandle) return;

        this.liveCandle.open = external.open;
        this.liveCandle.high = Math.max(this.liveCandle.high, external.high);
        this.liveCandle.low = Math.min(this.liveCandle.low, external.low);
        this.liveCandle.close = external.close;
    }
}