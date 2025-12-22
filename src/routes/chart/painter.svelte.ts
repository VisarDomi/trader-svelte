import type { ISeriesApi } from "lightweight-charts";
import type { MarketStore } from "$lib/stores/market.svelte.js";

export class ChartPainter {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private store: MarketStore;

    constructor(store: MarketStore) {
        this.store = store;

        // Reactive effect: When history changes
        $effect(() => {
            const loaded = this.store.isLoaded;
            const history = this.store.history;

            if (this.series && loaded && history.length > 0) {
                this.series.setData(history);
            }
        });

        // Reactive effect: When the last candle updates (streaming)
        $effect(() => {
            const candle = this.store.lastCandle;
            const loaded = this.store.isLoaded;

            if (this.series && loaded && candle) {
                this.series.update(candle);
            }
        });
    }

    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;
        // Immediate paint if data exists (handles race condition)
        if (this.store.isLoaded && this.store.history.length > 0) {
            this.series.setData(this.store.history);
        }
    }

    destroy() {
        this.series = null;
    }
}