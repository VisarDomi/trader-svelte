import type { ISeriesApi, IChartApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import type { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";

// Stores
import type { MarketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import type { AccountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import type { PositionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import type { TradeStore } from '$lib/domains/trading/stores/TradeStore.svelte.js';

// Features
import { PositionLines } from "$lib/features/chart-drawings/plugins/PositionLines.js";
import { CurrentPrice } from "$lib/features/chart-drawings/plugins/CurrentPrice.js";
import { Fee } from "$lib/features/chart-drawings/plugins/Fee.js";
import { HistoryLoaderPlugin } from "$lib/features/chart-drawings/plugins/HistoryLoaderPlugin.js";
import { LiveEdgePlugin } from "$lib/features/chart-drawings/plugins/LiveEdgePlugin.js";

export class ChartRenderer {
    // Reactive references for the effect
    private chart = $state<IChartApi | null>(null);
    private series = $state<ISeriesApi<"Candlestick"> | null>(null);
    private context = $state<ChartContext | null>(null);

    // Feature Registry
    private features: Types[] = [];

    constructor(
        private readonly marketStore: MarketStore,
        private readonly positionStore: PositionStore,
        private readonly tradeStore: TradeStore,
        private readonly accountStore: AccountStore
    ) {
        // Register all features
        this.features.push(new PositionLines());
        this.features.push(new CurrentPrice());
        this.features.push(new Fee());
        this.features.push(new HistoryLoaderPlugin());
        this.features.push(new LiveEdgePlugin());

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
                // Live update (tick)
                this.series.update(lastCandle);
            }

            // Note: Full history set/prepend is handled via direct setData calls
            // inside the Effect below or manually triggered logic,
            // but normally we need an Effect watching history specifically if we want it reactive.

            // 2. Update Features
            for (const feature of this.features) {
                feature.update(this.context);
            }
        });

        // History Load / Prepend Effect
        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            // Reactive dependency on history array reference change
            const history = this.marketStore.history;

            if (this.series && loaded && history.length > 0) {
                // LWC efficient update is 'update', but for full history change/prepend we use setData
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
    }

    destroy() {
        for (const feature of this.features) {
            feature.destroy();
        }
        this.chart = null;
        this.series = null;
    }
}