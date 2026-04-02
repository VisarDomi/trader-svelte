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
    | { kind: 'enforce'; anchorTime: number; rangeFrom: number; rangeTo: number; span: number; anchorChanged: boolean }
    | { kind: 'passive-follow'; oldTime: number; newTime: number; delta: number; liveVisible: boolean }
    | { kind: 'tracking-lost'; drift: number; tolerance: number; rangeTo: number; idealTo: number }
    | { kind: 'drift-check'; drift: number; tolerance: number; graceFrames: number; rangeTo: number; idealTo: number };

const DEFAULT_SPAN_SECONDS = 120 * 60;
const DRIFT_TOLERANCE = 0.03;
const GRACE_FRAMES_AFTER_ENFORCE = 3;
const USER_RELEASE_DELAY_MS = 300;

export class ChartCamera {
    private chart: IChartApi | null = null;

    private isTracking = true;

    private lastAnchorTime: number | null = null;

    private intendedSpan = DEFAULT_SPAN_SECONDS;

    private graceFrames = 0;
    private needsEnforce = false;

    private userOwnsViewport = false;
    private releaseTimer: ReturnType<typeof setTimeout> | null = null;

    init(chart: IChartApi) {
        this.chart = chart;
    }

    userAcquire(): void {
        if (this.releaseTimer) {
            clearTimeout(this.releaseTimer);
            this.releaseTimer = null;
        }
        this.userOwnsViewport = true;
    }

    userRelease(): void {
        if (this.releaseTimer) clearTimeout(this.releaseTimer);
        this.releaseTimer = setTimeout(() => {
            this.userOwnsViewport = false;
            this.releaseTimer = null;
        }, USER_RELEASE_DELAY_MS);
    }

    initializeView(savedState: ViewState | null, liveTime: number): CameraAction | null {
        if (!this.chart) return null;

        this.lastAnchorTime = liveTime;

        if (savedState) {
            this.restoreState(savedState, liveTime);
        } else {
            this.resetZoom(liveTime);
        }

        this.graceFrames = GRACE_FRAMES_AFTER_ENFORCE;

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
        this.graceFrames = GRACE_FRAMES_AFTER_ENFORCE;

        if (this.isTracking) {
            this.needsEnforce = true;
        }

        return { before, after: newRange };
    }

    updateAnchor(newAnchorTime: number): CameraAction[] {
        if (!newAnchorTime || !this.chart) return [];

        const actions: CameraAction[] = [];
        const oldAnchorTime = this.lastAnchorTime;
        const anchorChanged = newAnchorTime !== oldAnchorTime;
        this.lastAnchorTime = newAnchorTime;

        if (this.isTracking) {
            if (this.graceFrames > 0) {
                this.graceFrames--;
            } else if (!this.needsEnforce) {
                const driftResult = this.measureDrift();
                if (driftResult) {
                    actions.push({
                        kind: 'drift-check',
                        drift: driftResult.drift,
                        tolerance: driftResult.tolerance,
                        graceFrames: this.graceFrames,
                        rangeTo: driftResult.rangeTo,
                        idealTo: driftResult.idealTo,
                    });
                    if (driftResult.drift > driftResult.tolerance) {
                        this.isTracking = false;
                        actions.push({
                            kind: 'tracking-lost',
                            drift: Math.round(driftResult.drift),
                            tolerance: Math.round(driftResult.tolerance),
                            rangeTo: Math.round(driftResult.rangeTo),
                            idealTo: Math.round(driftResult.idealTo),
                        });
                    }
                }
            }
        }

        if (this.userOwnsViewport) {
        } else if (this.isTracking && (anchorChanged || this.needsEnforce)) {
            this.needsEnforce = false;
            actions.push(this.enforceLivePosition(newAnchorTime, undefined, anchorChanged));
        } else if (!this.isTracking && oldAnchorTime) {
            actions.push(this.checkAndApplyPassiveFollow(oldAnchorTime, newAnchorTime));
        }

        return actions;
    }

    resetZoom(anchorTime: number) {
        if (!this.chart || !anchorTime) return;

        this.isTracking = true;
        this.lastAnchorTime = anchorTime;
        this.intendedSpan = DEFAULT_SPAN_SECONDS;

        const { from, to } = this.calculateTargetRange(anchorTime, this.intendedSpan);
        this.chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
        this.graceFrames = GRACE_FRAMES_AFTER_ENFORCE;

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

        this.graceFrames = GRACE_FRAMES_AFTER_ENFORCE;
    }

    destroy() {
        if (this.releaseTimer) clearTimeout(this.releaseTimer);
        this.chart = null;
    }

    private measureDrift(): { drift: number; tolerance: number; rangeTo: number; idealTo: number } | null {
        if (!this.chart || !this.lastAnchorTime) return null;

        const range = this.chart.timeScale().getVisibleRange();
        if (!range) return null;

        const { to: idealTo } = this.calculateTargetRange(this.lastAnchorTime, this.intendedSpan);
        const tolerance = this.intendedSpan * DRIFT_TOLERANCE;
        const drift = Math.abs((range.to as number) - idealTo);

        return { drift, tolerance, rangeTo: range.to as number, idealTo };
    }

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
            this.chart.timeScale().setVisibleRange({
                from: (visibleFrom + delta) as UTCTimestamp,
                to: (visibleTo + delta) as UTCTimestamp
            });
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

    private enforceLivePosition(anchorTime: number, forceSpan?: number, anchorChanged = true): CameraAction {
        const fallback: CameraAction = { kind: 'enforce', anchorTime, rangeFrom: 0, rangeTo: 0, span: 0, anchorChanged };
        if (!this.chart) return fallback;

        if (forceSpan) {
            this.intendedSpan = forceSpan;
        }

        const { from, to } = this.calculateTargetRange(anchorTime, this.intendedSpan);

        this.chart.timeScale().setVisibleRange({
            from: from as UTCTimestamp,
            to: to as UTCTimestamp
        });

        this.graceFrames = GRACE_FRAMES_AFTER_ENFORCE;

        return { kind: 'enforce', anchorTime, rangeFrom: Math.round(from), rangeTo: Math.round(to), span: Math.round(this.intendedSpan), anchorChanged };
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
