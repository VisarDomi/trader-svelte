import type { ISeriesApi, IChartApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import type { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";
import type { ChartCamera } from "$lib/components/chart-engine/ChartCamera.js";

// Stores
import type { MarketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import type { AccountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import type { PositionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import type { TradeStore } from '$lib/domains/trading/stores/TradeStore.svelte.js';
import type { ChartStateManager } from "$lib/features/chart-orchestration/ChartStateManager.svelte.js";

// Features
import { PositionLines } from "$lib/features/chart-drawings/plugins/PositionLines.js";
import { CurrentPrice } from "$lib/features/chart-drawings/plugins/CurrentPrice.js";
import { Fee } from "$lib/features/chart-drawings/plugins/Fee.js";
import { HistoryLoaderPlugin } from "$lib/features/chart-drawings/plugins/HistoryLoaderPlugin.js";
import { LiveEdgePlugin } from "$lib/features/chart-drawings/plugins/LiveEdgePlugin.js";
import { ClockPlugin } from "$lib/features/chart-drawings/plugins/ClockPlugin.js";

export class ChartRenderer {
    // Reactive references for the effect
    private chart = $state<IChartApi | null>(null);
    private series = $state<ISeriesApi<"Candlestick"> | null>(null);
    private context = $state<ChartContext | null>(null);

    // Track initialization to distinguish between Initial Load and History Prepend
    private currentEpic = "";
    private hasInitializedView = false;

    // Use Timestamps for robust Prepend detection (instead of just length)
    private lastFirstTime = 0;

    // Feature Registry
    private features: Types[] = [];

    constructor(
        private readonly camera: ChartCamera,
        private readonly stateManager: ChartStateManager,
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
        this.features.push(new LiveEdgePlugin(this.camera));
        this.features.push(new ClockPlugin());

        // The Main Render Loop (Fast)
        $effect(() => {
            if (!this.context || !this.series) return;

            // 1. Update Candles (Core Data) - Tick Updates
            const loaded = this.context.isMarketLoaded;
            const lastCandle = this.context.lastCandle;

            // Trigger dependency
            const _trigger = this.marketStore.updateTrigger;

            if (loaded && lastCandle) {
                this.series.update(lastCandle);
            }

            // 2. Update Features
            for (const feature of this.features) {
                feature.update(this.context);
            }
        });

        // The History Loading Effect (Heavy)
        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            // STRICT SVELTE 5: We must maintain reference to `history` to detect changes
            const history = this.marketStore.history;
            const epic = this.marketStore.epic;

            // Context Switch Detection
            if (epic !== this.currentEpic) {
                this.currentEpic = epic;
                this.hasInitializedView = false;
                this.lastFirstTime = 0;
            }

            if (this.series && loaded && history.length > 0) {
                const currentFirstTime = Number(history[0].time);

                // Scenario A: First Load
                if (!this.hasInitializedView) {
                    this.series.setData(history);

                    const savedState = this.stateManager.loadState();
                    const lastTime = Number(history[history.length - 1].time);

                    this.camera.initializeView(savedState, lastTime);
                    this.hasInitializedView = true;
                    this.lastFirstTime = currentFirstTime;
                    return;
                }

                // Scenario B: History Prepend (Infinite Scroll)
                if (currentFirstTime < this.lastFirstTime) {
                    // ARCHITECTURE BYPASS:
                    // We intentionally SKIP calling setData() here.
                    // The MarketDataPump + ChartController have already handled
                    // the data update and viewport shift atomically via a direct callback.
                    // Doing it here would cause a "teleport" glitch due to async nature of $effect.

                    this.lastFirstTime = currentFirstTime;
                    return;
                }

                // Scenario C: Live Update / Refresh
                // If the start time hasn't changed (or moved forward), we assume it's a standard refresh.
                // We set data to ensure consistency.
                this.series.setData(history);
                this.lastFirstTime = currentFirstTime;
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