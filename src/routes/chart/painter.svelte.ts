import type { ISeriesApi } from "lightweight-charts";
import type { MarketStore } from "$lib/stores/market.svelte.js";

export class ChartPainter {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private store: MarketStore;

    constructor(store: MarketStore) {
        this.store = store;

        // Reactive effect: When history changes (re-fetch or data source switch), set data
        $effect(() => {
            if (this.series && this.store.isLoaded && this.store.history.length > 0) {
                this.series.setData(this.store.history);
            }
        });

        // Reactive effect: When the last candle updates (streaming), update the series
        $effect(() => {
            if (this.series && this.store.isLoaded && this.store.lastCandle) {
                this.series.update(this.store.lastCandle);
            }
        });
    }

    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;
        // Initial paint if store is already loaded
        if (this.store.isLoaded && this.store.history.length > 0) {
            this.series.setData(this.store.history);
        }
    }

    destroy() {
        this.series = null;
    }
}