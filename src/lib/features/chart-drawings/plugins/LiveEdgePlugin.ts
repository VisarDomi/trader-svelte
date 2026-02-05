import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import { marketStore } from "$lib/domains/market/stores/MarketStore.svelte.js";

/**
 * Ensures the chart "sticks" to the live edge when new candles appear,
 * unless the user has intentionally scrolled back into history.
 */
export class LiveEdgePlugin implements Types {
    id = "live_edge_sticker";

    private chart: IChartApi | null = null;
    private isUserBrowsingHistory = false;
    private lastTotalBars = 0;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.chart = chart;
        chart.timeScale().subscribeVisibleLogicalRangeChange(this.checkUserScroll);
    }

    update(context: any): void {
        if (!this.chart) return;

        const currentTotal = marketStore.history.length;
        const hasNewData = currentTotal > this.lastTotalBars;

        // If new data arrived (and it wasn't a history prepend, handled by HistoryLoader)
        // We only care about append here (Live Data)
        if (hasNewData) {
            // If user is NOT browsing history, force the camera to the right
            if (!this.isUserBrowsingHistory) {
                this.chart.timeScale().scrollToRealTime();
            }
            this.lastTotalBars = currentTotal;
        }
    }

    destroy(): void {
        if (this.chart) {
            this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.checkUserScroll);
            this.chart = null;
        }
    }

    private checkUserScroll = () => {
        if (!this.chart) return;

        const range = this.chart.timeScale().getVisibleLogicalRange();
        if (!range) return;

        const distToRight = (this.lastTotalBars - 1) - range.to;

        // Logic:
        // If the user is viewing the latest bar (within small tolerance), they are "Live".
        // If they scroll back (> 2 bars), they enter "Browsing Mode".
        if (distToRight > 2) {
            this.isUserBrowsingHistory = true;
        } else {
            // Snap back to live mode if they drag to the right edge
            this.isUserBrowsingHistory = false;
        }
    };
}