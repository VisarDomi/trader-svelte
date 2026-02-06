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

    // "Tracking Mode" enforces the strict RESET layout (140px from right)
    private isTracking = true;

    // We store the last known anchor to support resizing/restoring without new data
    private lastAnchorTime: number | null = null;

    init(chart: IChartApi) {
        this.chart = chart;

        // Listen to user interaction to break strict tracking mode
        this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
            this.handleUserInteraction();
        });
    }

    /**
     * ATOMIC INITIALIZATION:
     * Called strictly after MainSeries.setData() to fix the viewport immediately.
     */
    initializeView(savedState: ViewState | null, liveTime: number) {
        if (!this.chart) return;

        this.lastAnchorTime = liveTime;

        if (savedState) {
            this.restoreState(savedState, liveTime);
        } else {
            this.resetZoom(liveTime);
        }
    }

    /**
     * Called whenever history is prepended to the chart.
     */
    maintainScrollPosition(barsAdded: number) {
        if (!this.chart || barsAdded <= 0) return;

        const timeScale = this.chart.timeScale();
        const currentRange = timeScale.getVisibleLogicalRange();

        if (currentRange) {
            timeScale.setVisibleLogicalRange({
                from: currentRange.from + barsAdded,
                to: currentRange.to + barsAdded
            });
        }
    }

    /**
     * Called by the system whenever new market data arrives (Live Tick).
     *
     * STRATEGY: "PASSIVE FOLLOW"
     * 1. If strict `isTracking` is active, force the specific layout (Reset position).
     * 2. If NOT tracking, check if the live candle is visible.
     * 3. If visible, shift the view forward by the time difference to keep it in view relative to the screen.
     */
    updateAnchor(newAnchorTime: number) {
        if (!newAnchorTime || !this.chart) return;

        const oldAnchorTime = this.lastAnchorTime;
        this.lastAnchorTime = newAnchorTime;

        if (this.isTracking) {
            this.enforceLivePosition(newAnchorTime);
        } else if (oldAnchorTime) {
            this.checkAndApplyPassiveFollow(oldAnchorTime, newAnchorTime);
        }
    }

    /**
     * Resets the chart to the "Default" view:
     * Sets strict tracking to TRUE.
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

        this.chart.priceScale('right').applyOptions({ autoScale: true });
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

    private checkAndApplyPassiveFollow(oldTime: number, newTime: number) {
        if (!this.chart) return;
        const timeScale = this.chart.timeScale();
        const range = timeScale.getVisibleRange();

        if (!range) return;

        const visibleFrom = range.from as number;
        const visibleTo = range.to as number;

        // CHECK: Is the OLD live candle currently on screen?
        // We use a small buffer to handle edge cases where it's just barely off-screen
        const buffer = (visibleTo - visibleFrom) * 0.05; // 5% buffer
        const isLiveVisible = (oldTime >= visibleFrom - buffer) && (oldTime <= visibleTo + buffer);

        if (isLiveVisible) {
            // PASSIVE FOLLOW: Shift the view forward by the exact time delta
            // This makes the chart appear to "flow" without snapping the user's zoom or offset.
            const delta = newTime - oldTime;

            if (delta > 0) {
                timeScale.setVisibleRange({
                    from: (visibleFrom + delta) as UTCTimestamp,
                    to: (visibleTo + delta) as UTCTimestamp
                });
            }
        }
    }

    private restoreState(state: ViewState, currentLiveTime: number) {
        if (!this.chart) return;

        this.restoreGeometry(state);

        // Smart Resume: If the saved view was near the live edge, resume tracking.
        const distToLive = currentLiveTime - state.centerTime;
        const threshold = state.timeSpan / 2;

        if (distToLive < threshold) {
            this.isTracking = true;
            this.lastAnchorTime = currentLiveTime;
            this.enforceLivePosition(currentLiveTime, state.timeSpan);
        } else {
            this.isTracking = false;
        }
    }

    private handleUserInteraction() {
        if (!this.chart || !this.lastAnchorTime) return;

        if (this.isTracking) {
            const range = this.chart.timeScale().getVisibleRange();
            if (!range) return;

            const currentSpan = (range.to as number) - (range.from as number);
            const { to: idealTo } = this.calculateTargetRange(this.lastAnchorTime, currentSpan);

            // Tolerance check to see if user broke strict tracking
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

        const span = forceSpan ?? (range
            ? (range.to as number) - (range.from as number)
            : DEFAULT_SPAN_SECONDS);

        const { from, to } = this.calculateTargetRange(anchorTime, span);

        timeScale.setVisibleRange({
            from: from as UTCTimestamp,
            to: to as UTCTimestamp
        });
    }

    private calculateTargetRange(anchorTime: number, span: number) {
        const widthPixels = viewport.width || 1000;
        const secondsPerPixel = span / widthPixels;
        const rightBufferSeconds = CHART_CONST.RESET_RIGHT_OFFSET_PIXELS * secondsPerPixel;

        const targetTo = anchorTime + rightBufferSeconds;
        const targetFrom = targetTo - span;

        return { from: targetFrom, to: targetTo };
    }

    private restoreGeometry(state: ViewState) {
        if (!this.chart) return;

        this.chart.priceScale('right').applyOptions({ autoScale: false });
        const pHalf = state.priceSpan / 2;
        this.chart.priceScale('right').setVisibleRange({
            from: state.centerPrice - pHalf,
            to: state.centerPrice + pHalf
        });

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