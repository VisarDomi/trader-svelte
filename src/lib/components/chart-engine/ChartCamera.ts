import type { IChartApi, IRange, Time, UTCTimestamp } from 'lightweight-charts';
import * as CHART_CONST from '$lib/shared/constants/chart.js';

export interface ViewState {
    centerTime: number;
    timeSpan: number;
    centerPrice: number;
    priceSpan: number;
}

export class ChartCamera {
    private chart: IChartApi | null = null;

    // Configurable offset for "Live" view (how much empty space to the right)
    // We calculate this in seconds roughly equivalent to pixels,
    // or we simply use a time buffer.
    private readonly RIGHT_OFFSET_SECONDS = 15 * 60; // 15 minutes of empty space by default

    init(chart: IChartApi) {
        this.chart = chart;
    }

    /**
     * Pans the chart to the specific timestamp, keeping it near the right edge.
     * Crucially, this IGNORES the Ghost Series data that might exist in the future.
     */
    panToLive(lastCandleTime: number) {
        if (!this.chart) return;

        const timeScale = this.chart.timeScale();

        // 1. Get current zoom span (how many seconds are visible?)
        const range = timeScale.getVisibleRange();
        const span = range
            ? (range.to as number) - (range.from as number)
            : 2 * 60 * 60; // Default 2 hours if unknown

        // 2. Calculate target range
        // We want 'to' to be slightly in the future relative to the candle
        // to leave whitespace, but NOT all the way to the Ghost Series end.
        const targetTo = lastCandleTime + this.calculateRightBuffer(span);
        const targetFrom = targetTo - span;

        timeScale.setVisibleRange({
            from: targetFrom as UTCTimestamp,
            to: targetTo as UTCTimestamp
        });
    }

    /**
     * captures the current geometric state of the chart
     */
    getViewState(): ViewState | null {
        if (!this.chart) return null;

        const timeRange = this.chart.timeScale().getVisibleRange();
        const priceScale = this.chart.priceScale('right');
        const priceRange = priceScale.getVisibleRange();

        if (!timeRange || !priceRange) return null;

        return {
            ...this.calculateTimeState(timeRange),
            ...this.calculatePriceState(priceRange)
        };
    }

    /**
     * Restores geometric state
     */
    restoreViewState(state: ViewState) {
        if (!this.chart) return;

        // 1. Restore Price (Y-Axis)
        this.chart.priceScale('right').applyOptions({ autoScale: false });
        const pHalf = state.priceSpan / 2;
        this.chart.priceScale('right').setVisibleRange({
            from: state.centerPrice - pHalf,
            to: state.centerPrice + pHalf
        });

        // 2. Restore Time (X-Axis)
        const tHalf = state.timeSpan / 2;
        this.chart.timeScale().setVisibleRange({
            from: (state.centerTime - tHalf) as UTCTimestamp,
            to: (state.centerTime + tHalf) as UTCTimestamp
        });
    }

    resetZoom(lastCandleTime: number) {
        // Default reset behavior: just snap to live
        this.panToLive(lastCandleTime);
        this.chart?.priceScale('right').applyOptions({ autoScale: true });
    }

    destroy() {
        this.chart = null;
    }

    // --- Helpers ---

    private calculateRightBuffer(currentSpan: number): number {
        // We want the whitespace to be proportional to the zoom level.
        // e.g. 5% of the screen width.
        return currentSpan * 0.05;
    }

    private calculateTimeState(range: IRange<Time>) {
        const tFrom = range.from as number;
        const tTo = range.to as number;
        const timeSpan = tTo - tFrom;
        const centerTime = tFrom + (timeSpan / 2);
        return { centerTime, timeSpan };
    }

    private calculatePriceState(range: IRange<number>) {
        const pMin = range.from;
        const pMax = range.to;
        const priceSpan = pMax - pMin;
        const centerPrice = pMin + (priceSpan / 2);
        return { centerPrice, priceSpan };
    }
}