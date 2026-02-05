import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import type { ChartCamera } from "$lib/components/chart-engine/ChartCamera.js";
import { marketStore } from "$lib/domains/market/stores/MarketStore.svelte.js";
import type { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";

/**
 * Ensures the chart "sticks" to the live edge when new candles appear,
 * unless the user has intentionally scrolled back into history.
 *
 * Refactored to delegate "History Detection" to the Camera,
 * correctly ignoring Ghost Series.
 */
export class LiveEdgePlugin implements Types {
    id = "live_edge_sticker";

    private chart: IChartApi | null = null;
    private isUserBrowsing = false;
    private lastTotalBars = 0;

    // We need to track this locally for the event listener
    private lastKnownAnchorTime = 0;

    constructor(private readonly camera: ChartCamera) {}

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.chart = chart;
        chart.timeScale().subscribeVisibleLogicalRangeChange(this.checkUserScroll);
    }

    update(context: ChartContext): void {
        if (!this.chart || !context.lastCandle) return;

        const anchorTime = Number(context.lastCandle.time);
        this.lastKnownAnchorTime = anchorTime;

        const currentTotal = marketStore.history.length;
        const hasNewData = currentTotal > this.lastTotalBars;

        // If new data arrived (Live Tick or History Append)
        if (hasNewData) {

            // Check Camera: Is user looking at the past?
            // This is safer than the old "distToRight" which broke with Ghost Series.
            this.isUserBrowsing = this.camera.isUserBrowsingHistory(anchorTime);

            // If NOT browsing history, snap to live.
            if (!this.isUserBrowsing) {
                this.camera.panToLive(anchorTime);
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
        // We only update our local flag here. The actual "Snap" happens in update().
        // This ensures that manual scrolling immediately flags "Browsing".
        if (this.lastKnownAnchorTime > 0) {
            this.isUserBrowsing = this.camera.isUserBrowsingHistory(this.lastKnownAnchorTime);
        }
    };
}