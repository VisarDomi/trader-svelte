import type { IChartApi, ISeriesApi, LogicalRange } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import { marketDataPump } from "$lib/domains/market/services/MarketDataPump.js";
import { marketStore } from "$lib/domains/market/stores/MarketStore.svelte.js";

/**
 * Monitors the chart scroll position.
 * If the user scrolls to the left edge (Logical Index near 0),
 * triggers a historical data fetch and manages the visual offset
 * to prevent the chart from jumping.
 */
export class HistoryLoaderPlugin implements Types {
    id = "history_loader";

    private chart: IChartApi | null = null;

    // We keep track of the history length to detect when data was added
    private lastHistoryLength = 0;

    // To restore position after prepend
    private previousFirstVisibleTime: number | null = null;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.chart = chart;

        // Subscribe to scroll events
        chart.timeScale().subscribeVisibleLogicalRangeChange(this.handleRangeChange);
    }

    update(context: any): void {
        // DETECT DATA GROWTH
        const currentLength = marketStore.history.length;

        if (currentLength > this.lastHistoryLength) {
            const addedCount = currentLength - this.lastHistoryLength;

            // If we have a stored position and data grew (prepend), restore view
            // (Only if we were fetching history, not just initial load)
            if (this.previousFirstVisibleTime && addedCount > 1) {
                console.log(`[HistoryLoader] Detected growth of ${addedCount} bars. Adjusting scroll.`);

                // Restore Logic:
                // We assume the added bars were prepended.
                // We shift the visible range by +addedCount so the user keeps looking at the same candles.
                this.adjustScrollPosition(addedCount);
            }

            this.lastHistoryLength = currentLength;
            this.previousFirstVisibleTime = null;
        }
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

            // Mark that we are initiating a load that requires visual adjustment
            this.previousFirstVisibleTime = Date.now();

            // Debounce/Throttle check happens inside Pump flag 'isLoadingHistory'
            console.log(`[HistoryLoader] Near edge (from=${range.from.toFixed(1)}). Requesting more history...`);

            void marketDataPump.loadMoreHistory();
        }
    };

    private adjustScrollPosition(shiftAmount: number) {
        if (!this.chart) return;

        const currentRange = this.chart.timeScale().getVisibleLogicalRange();
        if (!currentRange) return;

        // Shift the view to the right to compensate for the inserted bars
        const newFrom = currentRange.from + shiftAmount;
        const newTo = currentRange.to + shiftAmount;

        this.chart.timeScale().setVisibleLogicalRange({
            from: newFrom,
            to: newTo
        });
    }
}