import type { ISeriesApi, IChartApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import type { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";
import type { ChartCamera } from "$lib/components/chart-engine/ChartCamera.js";

import type { MarketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import type { AccountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import type { PositionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import type { TradeStore } from '$lib/domains/trading/stores/TradeStore.svelte.js';
import type { ChartStateManager } from "$lib/features/chart-orchestration/ChartStateManager.svelte.js";
import type { ChartCandle } from '$lib/shared/types/market.js';
import { log, serverLog, LogEvent } from '$lib/shared/utils/log.js';

import { PositionLines } from "$lib/features/chart-drawings/plugins/PositionLines.js";
import { CurrentPrice } from "$lib/features/chart-drawings/plugins/CurrentPrice.js";
import { Fee } from "$lib/features/chart-drawings/plugins/Fee.js";
import { HistoryLoaderPlugin } from "$lib/features/chart-drawings/plugins/HistoryLoaderPlugin.js";
import { LiveEdgePlugin } from "$lib/features/chart-drawings/plugins/LiveEdgePlugin.js";
import { ClockPlugin } from "$lib/features/chart-drawings/plugins/ClockPlugin.js";

/** Captured by the $effect when historyVersion advances. Persists until RAF consumes it. */
interface HistoryCommand {
    history: ChartCandle[];
    version: number;
    isFirstRender: boolean;
    prevCandles: number;
    prependCount: number;
}

export class ChartRenderer {

    private chart = $state<IChartApi | null>(null);
    private series = $state<ISeriesApi<"Candlestick"> | null>(null);
    private context = $state<ChartContext | null>(null);

    private renderedVersion = 0;
    private viewInitialized = false;
    private lastRenderedCandles = 0;

    // RAF adapter — $effect writes, RAF reads
    private rafId = 0;
    private pendingHistory: HistoryCommand | null = null;

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

        // Functional core: $effect subscribes to reactive state and captures
        // render intent. All LWC imperative calls happen in the RAF shell.
        $effect(() => {
            if (!this.context || !this.series) return;

            // Subscribe to every change source that should trigger a render
            const _loaded = this.context.isMarketLoaded;
            const _lastCandle = this.context.lastCandle;
            const _trigger = this.marketStore.updateTrigger;
            const history = this.marketStore.history;
            const version = this.marketStore.historyVersion;
            const marketLoaded = this.marketStore.isLoaded;

            // Capture history change — persists in pendingHistory until RAF consumes it.
            // Multiple $effect runs between RAFs won't lose this because renderedVersion
            // is updated immediately, so subsequent runs skip this branch.
            if (marketLoaded && history.length > 0 && version !== this.renderedVersion) {
                const isFirstRender = this.renderedVersion === 0;
                const prevCandles = this.lastRenderedCandles;
                this.renderedVersion = version;

                this.pendingHistory = {
                    history,
                    version,
                    isFirstRender,
                    prevCandles,
                    prependCount: this.marketStore.consumePrependCount(version),
                };
            }

            this.scheduleRender();
        });
    }

    /** At most one RAF pending at a time. Multiple $effect runs coalesce into one render. */
    private scheduleRender() {
        if (this.rafId) return;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = 0;
            this.flush();
        });
    }

    /**
     * Imperative shell: all LWC API calls happen here, in one synchronous pass per frame.
     * Wrapped in camera.beginFlush/endFlush so the camera's range-change listener
     * ignores all programmatic range changes (setData, update, enforce, etc.).
     */
    private flush() {
        if (!this.series || !this.context) return;

        this.camera.beginFlush();
        try {
            // --- Phase 1: setData (history) ---
            const h = this.pendingHistory;
            if (h) {
                this.pendingHistory = null;
                this.series.setData(h.history);
                this.lastRenderedCandles = h.history.length;

                if (h.isFirstRender || h.version <= 2 || h.prependCount > 0) {
                    serverLog({
                        tag: LogEvent.ChartRender,
                        version: h.version,
                        candles: h.history.length,
                        isFirstRender: h.isFirstRender,
                        prependCount: h.prependCount,
                    });
                }

                if (h.isFirstRender || !this.viewInitialized) {
                    const savedState = this.stateManager.loadState();
                    const lastTime = Number(h.history[h.history.length - 1].time);
                    const initAction = this.camera.initializeView(savedState, lastTime);
                    if (initAction) {
                        serverLog({ tag: LogEvent.CameraInit, anchorTime: initAction.anchorTime, tracking: initAction.tracking, source: initAction.source });
                    }
                    this.viewInitialized = true;
                } else if (h.prependCount > 0) {
                    const { before, after } = this.camera.maintainScrollPosition(h.prependCount);
                    serverLog({ tag: LogEvent.PrependApply, version: h.version, count: h.prependCount, rangeBefore: before, rangeAfter: after });
                } else if (h.prevCandles > 0 && h.history.length - h.prevCandles > 100) {
                    log.warn(`[ChartRenderer] Large candle growth (${h.prevCandles} → ${h.history.length}) at version ${h.version} with no prepend — possible regression`);
                }
            }

            // --- Phase 2: live candle (update) — always after setData ---
            const lastCandle = this.context.lastCandle;
            if (this.context.isMarketLoaded && lastCandle) {
                this.series.update(lastCandle);
            }

            // --- Phase 3: plugins (camera anchor, price lines, etc.) ---
            for (const feature of this.features) {
                feature.update(this.context);
            }
        } finally {
            this.camera.endFlush();
        }
    }

    init(chart: IChartApi, series: ISeriesApi<"Candlestick">, context: ChartContext) {
        this.chart = chart;
        this.series = series;
        this.context = context;
        this.renderedVersion = 0;
        this.viewInitialized = false;
        this.lastRenderedCandles = 0;

        for (const feature of this.features) {
            feature.mount(chart, series);
        }
    }

    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        this.pendingHistory = null;
        for (const feature of this.features) {
            feature.destroy();
        }
        this.chart = null;
        this.series = null;
    }
}
