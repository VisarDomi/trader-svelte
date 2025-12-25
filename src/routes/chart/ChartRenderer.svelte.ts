import type { ISeriesApi, IChartApi } from "lightweight-charts";
import type { ChartFeature } from "$lib/core/ChartFeature.js";
import type { ChartContext } from "$lib/features/chart/ChartContext.svelte.js";

// Stores
import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { TradeStore } from '$lib/stores/trade.svelte.js';

// Features
import { PositionLinesFeature } from "$lib/features/chart/lines/PositionLinesFeature.js";
import { CurrentPriceFeature } from "$lib/features/chart/lines/CurrentPriceFeature.js";
import { FeePrimitiveFeature } from "$lib/features/chart/primitives/FeePrimitiveFeature.js";

export class ChartRenderer {
    // Reactive references for the effect
    private chart = $state<IChartApi | null>(null);
    private series = $state<ISeriesApi<"Candlestick"> | null>(null);
    private context = $state<ChartContext | null>(null);

    // Feature Registry
    private features: ChartFeature[] = [];

    constructor(
        private readonly marketStore: MarketStore,
        private readonly positionStore: PositionStore,
        private readonly tradeStore: TradeStore,
        private readonly accountStore: AccountStore
    ) {
        // Register all features
        this.features.push(new PositionLinesFeature());
        this.features.push(new CurrentPriceFeature());
        this.features.push(new FeePrimitiveFeature());

        // The Main Render Loop
        $effect(() => {
            if (!this.context || !this.series) return;

            // 1. Update Candles (Core Data)
            // TODO: In Phase 3, move this to MarketCandlesFeature
            const loaded = this.context.isMarketLoaded;
            const lastCandle = this.context.lastCandle;

            // Trigger dependency
            const _trigger = this.marketStore.updateTrigger;

            if (loaded && lastCandle) {
                this.series.update(lastCandle);
            }

            // 2. Update Features
            // The renderer no longer knows *what* it is rendering, only *that* it is rendering.
            for (const feature of this.features) {
                feature.update(this.context);
            }
        });

        // Initial History Load
        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            const history = this.marketStore.history;
            if (this.series && loaded && history.length > 0) {
                this.series.setData(history);
            }
        });
    }

    init(chart: IChartApi, series: ISeriesApi<"Candlestick">, context: ChartContext) {
        this.chart = chart;
        this.series = series;
        this.context = context;

        // Mount Features
        for (const feature of this.features) {
            feature.mount(chart, series);
        }

        // Initial Render of history
        if (this.marketStore.isLoaded && this.marketStore.history.length > 0) {
            this.series.setData(this.marketStore.history);
        }
    }

    destroy() {
        for (const feature of this.features) {
            feature.destroy();
        }
        this.chart = null;
        this.series = null;
    }
}