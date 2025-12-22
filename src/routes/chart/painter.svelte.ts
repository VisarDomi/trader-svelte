import type { ISeriesApi } from "lightweight-charts";
import type { MarketStore } from "$lib/stores/market.svelte.js";

export class ChartPainter {
    private series: ISeriesApi<"Candlestick"> | null = null;

    constructor(private readonly marketStore: MarketStore) {
        // Reactive effect: When history changes
        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            const history = this.marketStore.history;

            if (this.series && loaded && history.length > 0) {
                this.series.setData(history);
            }
        });

        // Reactive effect: When the last candle updates (streaming)
        $effect(() => {
            const candle = this.marketStore.lastCandle;
            const loaded = this.marketStore.isLoaded;

            if (this.series && loaded && candle) {
                this.series.update(candle);
            }
        });
    }

    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;

        // Immediate paint if data exists (handles race condition during hot reload or fast switching)
        if (this.marketStore.isLoaded && this.marketStore.history.length > 0) {
            this.series.setData(this.marketStore.history);
        }
    }

    destroy() {
        this.series = null;
    }
}