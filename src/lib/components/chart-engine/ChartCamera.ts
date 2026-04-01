import type { IChartApi, IRange, Time, UTCTimestamp } from 'lightweight-charts';
import * as CHART_CONST from '$lib/shared/constants/chart.js';
import { viewport } from '$lib/core/services/ViewportService.svelte.js';

export interface ViewState {
    centerTime: number;
    timeSpan: number;
    centerPrice: number;
    priceSpan: number;
}

export interface CapturedViewport {
    barSpacing: number;
    apiPriceFrom: number;
    apiPriceTo: number;
    priceAreaH: number;
}

export type CameraAction =
    | { kind: 'init'; anchorTime: number; tracking: boolean; source: 'saved' | 'default' }
    | { kind: 'enforce'; anchorTime: number; rangeFrom: number; rangeTo: number; span: number }
    | { kind: 'passive-follow'; oldTime: number; newTime: number; delta: number; liveVisible: boolean }
    | { kind: 'tracking-lost'; drift: number; tolerance: number; rangeTo: number; idealTo: number };

const DEFAULT_SPAN_SECONDS = 120 * 60;

export class ChartCamera {
    private chart: IChartApi | null = null;

    private isTracking = true;

    private lastAnchorTime: number | null = null;

    /**
     * Suppression counter for the range-change listener.
     * > 0 means all range changes are programmatic — ignore them.
     * Incremented by beginFlush (renderer) and withSuppress (camera writes outside flush).
     * Nest-safe: flush + internal setRange both increment without conflict.
     */
    private suppressCount = 0;

    /** Written by the range-change listener between frames (user scroll). Consumed by updateAnchor. */
    private pendingTrackingLost: CameraAction | null = null;

    init(chart: IChartApi) {
        this.chart = chart;

        this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
            this.handleRangeChange();
        });
    }

    /** Called by the renderer before flush(). All range changes until endFlush are programmatic. */
    beginFlush() { this.suppressCount++; }

    /** Called by the renderer after flush(). */
    endFlush() { this.suppressCount--; }

    initializeView(savedState: ViewState | null, liveTime: number): CameraAction | null {
        if (!this.chart) return null;

        this.lastAnchorTime = liveTime;

        if (savedState) {
            this.restoreState(savedState, liveTime);
        } else {
            this.resetZoom(liveTime);
        }

        return { kind: 'init', anchorTime: liveTime, tracking: this.isTracking, source: savedState ? 'saved' : 'default' };
    }

    maintainScrollPosition(barsAdded: number): { before: { from: number; to: number } | null; after: { from: number; to: number } | null } {
        if (!this.chart || barsAdded <= 0) return { before: null, after: null };

        const timeScale = this.chart.timeScale();
        const currentRange = timeScale.getVisibleLogicalRange();

        if (!currentRange) return { before: null, after: null };

        const before = { from: currentRange.from, to: currentRange.to };
        const newRange = { from: currentRange.from + barsAdded, to: currentRange.to + barsAdded };
        // Called during flush — suppressCount already > 0 from beginFlush.
        timeScale.setVisibleLogicalRange(newRange);
        return { before, after: newRange };
    }

    updateAnchor(newAnchorTime: number): CameraAction[] {
        if (!newAnchorTime || !this.chart) return [];

        const actions: CameraAction[] = [];

        // Drain user-scroll signal from between frames.
        if (this.pendingTrackingLost) {
            actions.push(this.pendingTrackingLost);
            this.pendingTrackingLost = null;
        }

        const oldAnchorTime = this.lastAnchorTime;
        this.lastAnchorTime = newAnchorTime;

        if (this.isTracking) {
            actions.push(this.enforceLivePosition(newAnchorTime));
        } else if (oldAnchorTime) {
            actions.push(this.checkAndApplyPassiveFollow(oldAnchorTime, newAnchorTime));
        }

        return actions;
    }

    resetZoom(anchorTime: number) {
        if (!this.chart || !anchorTime) return;

        this.isTracking = true;
        this.lastAnchorTime = anchorTime;
        this.pendingTrackingLost = null;

        const { from, to } = this.calculateTargetRange(anchorTime, DEFAULT_SPAN_SECONDS);
        this.setRange(from, to);

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

    captureViewport(): CapturedViewport | null {
        if (!this.chart) return null;

        const barSpacing = this.chart.timeScale().options().barSpacing;
        const apiRange = this.chart.priceScale('right').getVisibleRange();
        const chartH = this.chart.chartElement().clientHeight;
        const tsH = this.chart.timeScale().height();
        const priceAreaH = chartH - tsH;

        if (!apiRange || priceAreaH <= 0) return null;

        return { barSpacing, apiPriceFrom: apiRange.from, apiPriceTo: apiRange.to, priceAreaH };
    }

    applyResize(captured: CapturedViewport) {
        if (!this.chart) return;

        this.withSuppress(() => {
            this.chart!.applyOptions({
                timeScale: { barSpacing: captured.barSpacing }
            });

            const newChartH = this.chart!.chartElement().clientHeight;
            const newTsH = this.chart!.timeScale().height();
            const newPriceAreaH = newChartH - newTsH;

            if (newPriceAreaH <= 0) return;

            const oldSpan = captured.apiPriceTo - captured.apiPriceFrom;
            const newSpan = oldSpan * (newPriceAreaH / captured.priceAreaH);
            const center = captured.apiPriceFrom + oldSpan / 2;

            this.chart!.priceScale('right').applyOptions({ autoScale: false });
            this.chart!.priceScale('right').setVisibleRange({
                from: center - newSpan / 2,
                to: center + newSpan / 2
            });
        });
    }

    destroy() {
        this.chart = null;
        this.pendingTrackingLost = null;
    }

    // --- Private: range-change listener ---

    /**
     * Fires for every visible range change (LWC listener).
     * During flush or camera writes: suppressCount > 0 → skip (programmatic change).
     * Between flushes: suppressCount === 0 → user scrolled/zoomed → detect drift.
     */
    private handleRangeChange() {
        if (this.suppressCount > 0) return;
        if (!this.isTracking || !this.lastAnchorTime || !this.chart) return;

        const range = this.chart.timeScale().getVisibleRange();
        if (!range) return;

        const currentSpan = (range.to as number) - (range.from as number);
        const { to: idealTo } = this.calculateTargetRange(this.lastAnchorTime, currentSpan);

        const tolerance = currentSpan * 0.01;
        const drift = Math.abs((range.to as number) - idealTo);

        if (drift > tolerance) {
            this.isTracking = false;
            this.pendingTrackingLost = {
                kind: 'tracking-lost',
                drift: Math.round(drift),
                tolerance: Math.round(tolerance),
                rangeTo: Math.round(range.to as number),
                idealTo: Math.round(idealTo),
            };
        }
    }

    // --- Private: suppressed writes ---

    /** Wrap any camera code that writes to the time scale outside of flush. */
    private withSuppress(fn: () => void) {
        this.suppressCount++;
        try { fn(); } finally { this.suppressCount--; }
    }

    /** All programmatic time-range writes go through here. */
    private setRange(from: number, to: number) {
        if (!this.chart) return;

        this.withSuppress(() => {
            this.chart!.timeScale().setVisibleRange({
                from: from as UTCTimestamp,
                to: to as UTCTimestamp
            });
        });
    }

    // --- Private: camera modes ---

    private checkAndApplyPassiveFollow(oldTime: number, newTime: number): CameraAction {
        const delta = newTime - oldTime;
        const result: CameraAction = { kind: 'passive-follow', oldTime, newTime, delta, liveVisible: false };

        if (!this.chart) return result;

        const timeScale = this.chart.timeScale();
        const range = timeScale.getVisibleRange();
        if (!range) return result;

        const visibleFrom = range.from as number;
        const visibleTo = range.to as number;

        const buffer = (visibleTo - visibleFrom) * 0.05;
        const isLiveVisible = (oldTime >= visibleFrom - buffer) && (oldTime <= visibleTo + buffer);
        result.liveVisible = isLiveVisible;

        if (isLiveVisible && delta > 0) {
            this.setRange(visibleFrom + delta, visibleTo + delta);
        }

        return result;
    }

    private restoreState(state: ViewState, currentLiveTime: number) {
        if (!this.chart) return;

        this.restoreGeometry(state);

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

    private enforceLivePosition(anchorTime: number, forceSpan?: number): CameraAction {
        const fallback: CameraAction = { kind: 'enforce', anchorTime, rangeFrom: 0, rangeTo: 0, span: 0 };
        if (!this.chart) return fallback;

        const timeScale = this.chart.timeScale();
        const range = timeScale.getVisibleRange();

        const span = forceSpan ?? (range
            ? (range.to as number) - (range.from as number)
            : DEFAULT_SPAN_SECONDS);

        const { from, to } = this.calculateTargetRange(anchorTime, span);
        this.setRange(from, to);

        return { kind: 'enforce', anchorTime, rangeFrom: Math.round(from), rangeTo: Math.round(to), span: Math.round(span) };
    }

    // --- Private: geometry ---

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
        this.setRange(state.centerTime - tHalf, state.centerTime + tHalf);
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
