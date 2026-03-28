import type { ISeriesApi, IChartApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import type { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";
import type { ChartCamera } from "$lib/components/chart-engine/ChartCamera.js";

import type { MarketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import type { AccountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import type { PositionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import type { TradeStore } from '$lib/domains/trading/stores/TradeStore.svelte.js';
import type { ChartStateManager } from "$lib/features/chart-orchestration/ChartStateManager.svelte.js";
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';

import { PositionLines } from "$lib/features/chart-drawings/plugins/PositionLines.js";
import { CurrentPrice } from "$lib/features/chart-drawings/plugins/CurrentPrice.js";
import { Fee } from "$lib/features/chart-drawings/plugins/Fee.js";
import { HistoryLoaderPlugin } from "$lib/features/chart-drawings/plugins/HistoryLoaderPlugin.js";
import { LiveEdgePlugin } from "$lib/features/chart-drawings/plugins/LiveEdgePlugin.js";
import { ClockPlugin } from "$lib/features/chart-drawings/plugins/ClockPlugin.js";

export class ChartRenderer {

    private chart = $state<IChartApi | null>(null);
    private series = $state<ISeriesApi<"Candlestick"> | null>(null);
    private context = $state<ChartContext | null>(null);

    private renderedVersion = 0;
    private viewInitialized = false;

    private features: Types[] = [];

    constructor(
        private readonly camera: ChartCamera,
        private readonly stateManager: ChartStateManager,
        private readonly marketStore: MarketStore,
        private readonly positionStore: PositionStore,
        private readonly tradeStore: TradeStore,
        private readonly accountStore: AccountStore
    ) {

        this.features.push(new PositionLines());
        this.features.push(new CurrentPrice());
        this.features.push(new Fee());
        this.features.push(new HistoryLoaderPlugin());
        this.features.push(new LiveEdgePlugin(this.camera));
        this.features.push(new ClockPlugin());

        $effect(() => {
            if (!this.context || !this.series) return;

            const loaded = this.context.isMarketLoaded;
            const lastCandle = this.context.lastCandle;

            const _trigger = this.marketStore.updateTrigger;

            if (loaded && lastCandle) {
                this.series.update(lastCandle);
            }

            for (const feature of this.features) {
                feature.update(this.context);
            }
        });

        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            const history = this.marketStore.history;
            const version = this.marketStore.historyVersion;

            if (!this.series || !loaded || history.length === 0) return;
            if (version === this.renderedVersion) return;

            const isFirstRender = this.renderedVersion === 0;
            this.renderedVersion = version;

            const prependCount = this.marketStore.consumePrependCount(version);
            this.series.setData(history);

            if (isFirstRender || version <= 2 || prependCount > 0) {
                serverLog({
                    tag: LogEvent.ChartRender,
                    version,
                    candles: history.length,
                    isFirstRender,
                    prependCount,
                });
            }

            if (isFirstRender || !this.viewInitialized) {
                const savedState = this.stateManager.loadState();
                const lastTime = Number(history[history.length - 1].time);
                this.camera.initializeView(savedState, lastTime);
                this.viewInitialized = true;
            } else if (prependCount > 0) {
                this.camera.maintainScrollPosition(prependCount);
            }
        });
    }

    init(chart: IChartApi, series: ISeriesApi<"Candlestick">, context: ChartContext) {
        this.chart = chart;
        this.series = series;
        this.context = context;
        this.renderedVersion = 0;
        this.viewInitialized = false;

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
