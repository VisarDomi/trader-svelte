import type { ChartCandle } from '$lib/shared/types/market.js';
import { log } from '$lib/shared/utils/log.js';

export class CandleTimeline {
    private candles: ChartCandle[] = [];

    get length(): number { return this.candles.length; }

    oldest(): ChartCandle | undefined { return this.candles[0]; }
    newest(): ChartCandle | undefined { return this.candles[this.candles.length - 1]; }

    toArray(): ChartCandle[] { return this.candles; }

    static from(raw: ChartCandle[]): CandleTimeline {
        const tl = new CandleTimeline();
        tl.candles = dedupAsc(raw);
        return tl;
    }

    prepend(older: ChartCandle[]): number {
        if (older.length === 0) return 0;
        const clean = dedupAsc(older);
        const cutoff = this.candles.length > 0 ? this.candles[0].time : Infinity;
        const kept = clean.filter(c => c.time < cutoff);
        this.candles = [...kept, ...this.candles];
        return kept.length;
    }

    append(candle: ChartCandle): void {
        const last = this.newest();
        if (last && candle.time <= last.time) return;
        this.candles = [...this.candles, candle];
    }

    merge(newer: ChartCandle[]): void {
        if (newer.length === 0) return;
        const clean = dedupAsc(newer);
        if (this.candles.length === 0) {
            this.candles = clean;
            return;
        }
        const firstNewTime = clean[0].time;
        const cutIdx = this.candles.findIndex(c => c.time >= firstNewTime);
        if (cutIdx === -1) {
            this.candles = [...this.candles, ...clean];
        } else {
            this.candles = [...this.candles.slice(0, cutIdx), ...clean];
        }
    }

    clear(): void {
        this.candles = [];
    }
}

function dedupAsc(candles: ChartCandle[]): ChartCandle[] {
    if (candles.length <= 1) return candles;
    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const result: ChartCandle[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].time !== sorted[i - 1].time) {
            result.push(sorted[i]);
        } else {
            log.warn(`[CandleTimeline] Dropped duplicate timestamp ${sorted[i].time}`);
        }
    }
    return result;
}
