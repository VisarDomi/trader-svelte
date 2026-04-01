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
     * The range LWC actually rendered after our last programmatic setVisibleRange.
     * Compared against current range to detect user scroll/zoom (drift).
     * Only meaningful while isTracking — cleared when tracking is lost.
     */
    private lastSetRange: { from: number; to: number } | null = null;

    init(chart: IChartApi) {
        this.chart = chart;
        // No listener — drift detection is pull-based in updateAnchor.
    }

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
        timeScale.setVisibleLogicalRange(newRange);

        // Read back snapped time range so drift detection stays correct.
        this.readBackRange();

        return { before, after: newRange };
    }

    updateAnchor(newAnchorTime: number): CameraAction[] {
        if (!newAnchorTime || !this.chart) return [];

        const actions: CameraAction[] = [];
        const oldAnchorTime = this.lastAnchorTime;
        this.lastAnchorTime = newAnchorTime;

        // Pull-based drift check: did the user scroll/zoom since our last write?
        if (this.isTracking && this.lastSetRange) {
            const driftAction = this.detectUserDrift();
            if (driftAction) {
                this.isTracking = false;
                this.lastSetRange = null;
                actions.push(driftAction);
            }
        }

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

        this.chart.applyOptions({
            timeScale: { barSpacing: captured.barSpacing }
        });

        const newChartH = this.chart.chartElement().clientHeight;
        const newTsH = this.chart.timeScale().height();
        const newPriceAreaH = newChartH - newTsH;

        if (newPriceAreaH <= 0) return;

        const oldSpan = captured.apiPriceTo - captured.apiPriceFrom;
        const newSpan = oldSpan * (newPriceAreaH / captured.priceAreaH);
        const center = captured.apiPriceFrom + oldSpan / 2;

        this.chart.priceScale('right').applyOptions({ autoScale: false });
        this.chart.priceScale('right').setVisibleRange({
            from: center - newSpan / 2,
            to: center + newSpan / 2
        });

        // Time scale may have shifted due to resize — read back.
        this.readBackRange();
    }

    destroy() {
        this.chart = null;
        this.lastSetRange = null;
    }

    // --- Private: drift detection ---

    /**
     * Compare current visible range against what we last set programmatically.
     * Any difference is user-initiated scroll/zoom (LWC bar-snapping is accounted
     * for because lastSetRange stores the post-snap read-back, not the request).
     */
    private detectUserDrift(): CameraAction | null {
        if (!this.chart || !this.lastSetRange) return null;

        const range = this.chart.timeScale().getVisibleRange();
        if (!range) return null;

        const actualTo = range.to as number;
        const expectedTo = this.lastSetRange.to;
        const currentSpan = (range.to as number) - (range.from as number);

        const tolerance = currentSpan * 0.01;
        const drift = Math.abs(actualTo - expectedTo);

        if (drift > tolerance) {
            return {
                kind: 'tracking-lost',
                drift: Math.round(drift),
                tolerance: Math.round(tolerance),
                rangeTo: Math.round(actualTo),
                idealTo: Math.round(expectedTo),
            };
        }

        return null;
    }

    // --- Private: range writes ---

    /** All programmatic time-range writes go through here. Reads back the snapped result. */
    private setRange(from: number, to: number) {
        if (!this.chart) return;

        this.chart.timeScale().setVisibleRange({
            from: from as UTCTimestamp,
            to: to as UTCTimestamp
        });

        this.readBackRange();
    }

    /** Read back what LWC actually rendered (after bar-snapping) into lastSetRange. */
    private readBackRange() {
        if (!this.chart) return;

        const actual = this.chart.timeScale().getVisibleRange();
        if (actual) {
            this.lastSetRange = { from: actual.from as number, to: actual.to as number };
        }
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
