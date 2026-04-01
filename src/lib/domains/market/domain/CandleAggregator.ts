import type { ChartCandle, CandleFrame } from '$lib/shared/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';

export class CandleAggregator {
    private liveCandle: ChartCandle | null = null;

    seed(candle: ChartCandle | null) {
        this.liveCandle = candle ? { ...candle } : null;
    }

    merge(frame: CandleFrame): boolean {
        if (!this.liveCandle) {
            this.liveCandle = { ...frame, close: frame.open };
            return true;
        }

        if (this.isSameMinute(this.liveCandle, frame)) {
            const before = { ...this.liveCandle };
            this.mergeCandleState(frame);

            const changed = before.open !== this.liveCandle.open
                || before.high !== this.liveCandle.high
                || before.low !== this.liveCandle.low;

            if (changed) {
                serverLog({
                    tag: LogEvent.CandleMerge,
                    time: this.liveCandle.time,
                    before: { o: before.open, h: before.high, l: before.low, c: before.close },
                    after: { o: this.liveCandle.open, h: this.liveCandle.high, l: this.liveCandle.low, c: this.liveCandle.close },
                });
            }
            return changed;
        } else if (frame.time > this.liveCandle.time) {
            this.liveCandle = { ...frame, close: frame.open };
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

    private isSameMinute(a: ChartCandle, b: CandleFrame): boolean {
        return a.time === b.time;
    }

    private mergeCandleState(frame: CandleFrame) {
        if (!this.liveCandle) return;

        this.liveCandle.open = frame.open;
        this.liveCandle.high = Math.max(this.liveCandle.high, frame.high);
        this.liveCandle.low = Math.min(this.liveCandle.low, frame.low);
    }
}
