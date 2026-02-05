import type { IChartApi, ISeriesApi, LogicalRange } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import { marketDataPump } from "$lib/domains/market/services/MarketDataPump.js";
import { marketStore } from "$lib/domains/market/stores/MarketStore.svelte.js";

/**
 * Monitors the chart scroll position.
 * If the user scrolls to the left edge (Logical Index near 0),
 * triggers a historical data fetch.
 *
 * REFACTOR NOTE: Visual Adjustment logic moved to ChartPluginManager/Camera
 * to ensure atomic synchrony with setData().
 */
export class HistoryLoaderPlugin implements Types {
    id = "history_loader";

    private chart: IChartApi | null = null;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.chart = chart;
        chart.timeScale().subscribeVisibleLogicalRangeChange(this.handleRangeChange);
    }

    update(context: any): void {
        // No update logic needed here, handled via Orchestrator reactivity
    }

    destroy(): void {
        if (this.chart) {
            this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.handleRangeChange);
            this.chart = null;
        }
    }

    private handleRangeChange = (range: LogicalRange | null) => {
        if (!range || !this.chart) return;

        // Threshold: If we are within 20 bars of the start (left side)
        // And we aren't already loading or exhausted
        // Note: Logical range from can be negative if user scrolls past zero
        if (range.from < 20 && !marketDataPump.isLoadingHistory && !marketDataPump.isHistoryExhausted) {
            // Log for debugging
            // console.log(`[HistoryLoader] Near edge (from=${range.from.toFixed(1)}). Requesting more history...`);
            void marketDataPump.loadMoreHistory();
        }
    };
}