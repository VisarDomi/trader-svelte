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

    // Constants for "Sane" Defaults
    private readonly DEFAULT_SPAN_SECONDS = 2 * 60 * 60; // 2 Hours
    private readonly RIGHT_OFFSET_PERCENTAGE = 0.15; // 15% empty space on right

    init(chart: IChartApi) {
        this.chart = chart;
    }

    /**
     * Determines if the user has scrolled significantly back into history,
     * ignoring the Ghost Series that might exist in the future.
     *
     * @param anchorTime - The timestamp of the last REAL candle
     */
    isUserBrowsingHistory(anchorTime: number): boolean {
        if (!this.chart) return false;

        const range = this.chart.timeScale().getVisibleRange();
        if (!range) return false;

        // If the rightmost visible moment is older than the anchor time (minus a small buffer),
        // the user is explicitly looking at the past.
        // We use a 2-minute buffer to allow for slight "wiggles" at the edge.
        const buffer = 120; // 2 minutes
        return (range.to as number) < (anchorTime - buffer);
    }

    /**
     * Pans the chart to the anchor time.
     * PRESERVES current zoom level (time span), but shifts the view
     * so the anchor is near the right edge.
     */
    panToLive(anchorTime: number) {
        if (!this.chart) return;

        const timeScale = this.chart.timeScale();
        const range = timeScale.getVisibleRange();

        // If range is invalid (e.g. initialization), fall back to default
        const span = range
            ? (range.to as number) - (range.from as number)
            : this.DEFAULT_SPAN_SECONDS;

        // Calculate geometry
        const { from, to } = this.calculateLiveRange(anchorTime, span);

        timeScale.setVisibleRange({
            from: from as UTCTimestamp,
            to: to as UTCTimestamp
        });
    }

    /**
     * HARD RESET.
     * Ignores current zoom/pan state.
     * Enforces a standard 2-hour window ending at the Anchor.
     * Fixes "Broken Reset" issue where chart stuck to 24h Ghost span.
     */
    resetZoom(anchorTime: number) {
        if (!this.chart) return;

        // 1. Force Time Scale to sane default
        const { from, to } = this.calculateLiveRange(anchorTime, this.DEFAULT_SPAN_SECONDS);

        this.chart.timeScale().setVisibleRange({
            from: from as UTCTimestamp,
            to: to as UTCTimestamp
        });

        // 2. Reset Price Scale to auto-fit the new time range
        this.chart.priceScale('right').applyOptions({ autoScale: true });
    }

    /**
     * Captures geometric state
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

    destroy() {
        this.chart = null;
    }

    // --- Helpers ---

    private calculateLiveRange(anchorTime: number, span: number) {
        // We want empty space on the right (Ghost area) to be a percentage of the total view
        const rightBuffer = span * this.RIGHT_OFFSET_PERCENTAGE;

        // The 'to' is in the future relative to the anchor
        const targetTo = anchorTime + rightBuffer;
        const targetFrom = targetTo - span;

        return { from: targetFrom, to: targetTo };
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