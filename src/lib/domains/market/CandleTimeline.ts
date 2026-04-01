import type { ChartCandle } from '$lib/shared/types/market.js';
import { log } from '$lib/shared/utils/log.js';

export interface MergeResult {
    /** Number of existing candles replaced by newer API data. */
    replaced: number;
    /** Number of new candles added beyond what existed. */
    extended: number;
    newestBefore: number;
    newestAfter: number;
}

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

    /** Append a completed candle. Replaces if same time (tick data is fresher than API). */
    append(candle: ChartCandle): 'added' | 'replaced' | 'dropped' {
        const last = this.newest();
        if (!last || candle.time > last.time) {
            this.candles = [...this.candles, candle];
            return 'added';
        }
        if (candle.time === last.time) {
            this.candles = [...this.candles.slice(0, -1), candle];
            return 'replaced';
        }
        return 'dropped';
    }

    /**
     * Merge API data into the timeline (API is source of truth for completed candles).
     * Replaces overlapping bars, extends if API has newer data, but NEVER trims —
     * existing bars beyond the new data's range are preserved.
     */
    merge(newer: ChartCandle[]): MergeResult {
        const newestBefore = this.newest()?.time ?? 0;

        if (newer.length === 0) {
            return { replaced: 0, extended: 0, newestBefore, newestAfter: newestBefore };
        }

        const clean = dedupAsc(newer);

        if (this.candles.length === 0) {
            this.candles = clean;
            return { replaced: 0, extended: clean.length, newestBefore: 0, newestAfter: this.newest()?.time ?? 0 };
        }

        const firstNewTime = clean[0].time;
        const lastNewTime = clean[clean.length - 1].time;
        const cutIdx = this.candles.findIndex(c => c.time >= firstNewTime);

        let replaced = 0;

        if (cutIdx === -1) {
            // All new data is after existing data — pure extension.
            this.candles = [...this.candles, ...clean];
        } else {
            // Preserve existing bars beyond the new data's range.
            const tailIdx = this.candles.findIndex(c => c.time > lastNewTime);
            const tail = tailIdx !== -1 ? this.candles.slice(tailIdx) : [];

            const existingOverlap = (tailIdx !== -1 ? tailIdx : this.candles.length) - cutIdx;
            replaced = Math.min(existingOverlap, clean.length);

            this.candles = [...this.candles.slice(0, cutIdx), ...clean, ...tail];
        }

        const newestAfter = this.newest()?.time ?? 0;
        const extended = newestAfter > newestBefore ? 1 : 0;

        return { replaced, extended, newestBefore, newestAfter };
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
