import type { IChartApi, IRange, Time, UTCTimestamp } from 'lightweight-charts';
import * as CHART_CONST from '$lib/shared/constants/chart.js';
import { viewport } from '$lib/core/services/ViewportService.svelte.js';

export interface ViewState {
    centerTime: number;
    timeSpan: number;
    centerPrice: number;
    priceSpan: number;
}

// Default to 2 hours if no span is known
const DEFAULT_SPAN_SECONDS = 120 * 60;

export class ChartCamera {
    private chart: IChartApi | null = null;

    // The "Source of Truth" for behavior
    private isTracking = true;

    // We store the last known anchor to support resizing/restoring without new data
    private lastAnchorTime: number | null = null;

    init(chart: IChartApi) {
        this.chart = chart;

        // Listen to user interaction to break tracking mode
        this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
            this.handleUserInteraction();
        });
    }

    /**
     * Called by the system whenever new market data arrives.
     * If we are in 'Tracking Mode', we force the view to the new anchor.
     */
    updateAnchor(anchorTime: number) {
        if (!anchorTime) return;
        this.lastAnchorTime = anchorTime;

        if (this.isTracking) {
            this.enforceLivePosition(anchorTime);
        }
    }

    /**
     * Resets the chart to the "Default" view:
     * 1. Sets mode to Tracking
     * 2. Sets zoom to DEFAULT_SPAN_SECONDS
     * 3. Aligns the Anchor to be exactly RESET_RIGHT_OFFSET_PIXELS from the edge
     */
    resetZoom(anchorTime: number) {
        if (!this.chart || !anchorTime) return;

        this.isTracking = true;
        this.lastAnchorTime = anchorTime;

        // Force a specific span (Zoom Reset)
        const { from, to } = this.calculateTargetRange(anchorTime, DEFAULT_SPAN_SECONDS);

        this.chart.timeScale().setVisibleRange({
            from: from as UTCTimestamp,
            to: to as UTCTimestamp
        });

        // Reset Y-Axis to fit this new X-Axis range
        this.chart.priceScale('right').applyOptions({ autoScale: true });
    }

    /**
     * Restores a saved state (e.g. from LocalStorage).
     * Smartly decides whether to resume Tracking based on the saved position.
     */
    restoreState(state: ViewState, currentLiveTime: number) {
        if (!this.chart) return;

        // 1. Apply geometric state
        this.restoreGeometry(state);

        // 2. Determine Intent
        // If the saved view was looking at the future/live-edge, resume tracking.
        const distToLive = currentLiveTime - state.centerTime;
        const threshold = state.timeSpan / 2;

        if (distToLive < threshold) {
            this.isTracking = true;
            this.lastAnchorTime = currentLiveTime;
            // Snap to exact live to fix any drift
            this.enforceLivePosition(currentLiveTime, state.timeSpan);
        } else {
            this.isTracking = false;
        }
    }

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

    destroy() {
        this.chart = null;
    }

    // --- Internal Logic ---

    private handleUserInteraction() {
        if (!this.chart || !this.lastAnchorTime) return;

        // If we are currently tracking, we need to check if the user *broke* it.
        if (this.isTracking) {
            const range = this.chart.timeScale().getVisibleRange();
            if (!range) return;

            const currentSpan = (range.to as number) - (range.from as number);
            const { to: idealTo } = this.calculateTargetRange(this.lastAnchorTime, currentSpan);

            // Tolerance: If user dragged more than 1% away from the ideal "Magnet" position
            const tolerance = currentSpan * 0.01;
            const drift = Math.abs((range.to as number) - idealTo);

            if (drift > tolerance) {
                this.isTracking = false;
            }
        }
    }

    private enforceLivePosition(anchorTime: number, forceSpan?: number) {
        if (!this.chart) return;

        const timeScale = this.chart.timeScale();
        const range = timeScale.getVisibleRange();

        // Use current span or fallback/force
        const span = forceSpan ?? (range
            ? (range.to as number) - (range.from as number)
            : DEFAULT_SPAN_SECONDS);

        const { from, to } = this.calculateTargetRange(anchorTime, span);

        timeScale.setVisibleRange({
            from: from as UTCTimestamp,
            to: to as UTCTimestamp
        });
    }

    /**
     * Calculates the [From, To] range such that:
     * 1. The total width is 'span' seconds
     * 2. The 'anchorTime' is positioned exactly RESET_RIGHT_OFFSET_PIXELS from the right edge.
     */
    private calculateTargetRange(anchorTime: number, span: number) {
        const widthPixels = viewport.width || 1000; // Safe fallback

        // Calculate how many seconds correspond to 1 pixel at this zoom level
        const secondsPerPixel = span / widthPixels;

        // Calculate the time buffer based on the pixel constant
        const rightBufferSeconds = CHART_CONST.RESET_RIGHT_OFFSET_PIXELS * secondsPerPixel;

        // Target To = Anchor + Buffer
        // This puts the Anchor exactly 'rightBufferSeconds' (== 100px) away from the edge
        const targetTo = anchorTime + rightBufferSeconds;
        const targetFrom = targetTo - span;

        return { from: targetFrom, to: targetTo };
    }

    private restoreGeometry(state: ViewState) {
        if (!this.chart) return;

        // Restore Y
        this.chart.priceScale('right').applyOptions({ autoScale: false });
        const pHalf = state.priceSpan / 2;
        this.chart.priceScale('right').setVisibleRange({
            from: state.centerPrice - pHalf,
            to: state.centerPrice + pHalf
        });

        // Restore X
        const tHalf = state.timeSpan / 2;
        this.chart.timeScale().setVisibleRange({
            from: (state.centerTime - tHalf) as UTCTimestamp,
            to: (state.centerTime + tHalf) as UTCTimestamp
        });
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