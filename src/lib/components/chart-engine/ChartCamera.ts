import type { IChartApi, IRange, Time, UTCTimestamp } from 'lightweight-charts';
import * as CHART_CONST from '$lib/shared/constants/chart.js';
import { viewport } from '$lib/core/services/ViewportService.svelte.js';
import { log } from '$lib/shared/utils/log.js';

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

export interface CameraInitAction {
    kind: 'init';
    anchorTime: number;
    tracking: boolean;
    source: 'saved' | 'default';
}

export type CameraUpdateAction =
    | { kind: 'enforce'; anchorTime: number; rangeFrom: number; rangeTo: number; span: number; anchorChanged: boolean };

const DEFAULT_SPAN_SECONDS = 120 * 60;

export class ChartCamera {
    private chart: IChartApi | null = null;

    private isTracking = true;

    private lastAnchorTime: number | null = null;

    private intendedSpan = DEFAULT_SPAN_SECONDS;

    private userOwnsViewport = false;
    private acquireRange: { from: number; to: number } | null = null;

    init(chart: IChartApi) {
        this.chart = chart;
    }

    private traceWrite(caller: string) {
        const r = this.chart?.timeScale().getVisibleLogicalRange();
        log.trace(`[viewport-write] ${caller} → logical={from:${r ? Math.round(r.from) : '?'},to:${r ? Math.round(r.to) : '?'}} tracking=${this.isTracking} userOwns=${this.userOwnsViewport}`);
    }

    userAcquire(): void {
        this.userOwnsViewport = true;
        const range = this.chart?.timeScale().getVisibleRange();
        this.acquireRange = range ? { from: range.from as number, to: range.to as number } : null;
    }

    userRelease(): void {
        this.userOwnsViewport = false;
        this.checkTrackingOnRelease();
    }

    initializeView(savedState: ViewState | null, liveTime: number): CameraInitAction | null {
        if (!this.chart) return null;

        this.lastAnchorTime = liveTime;

        if (savedState) {
            this.restoreState(savedState, liveTime);
        } else {
            this.resetZoom(liveTime);
        }

        return { kind: 'init', anchorTime: liveTime, tracking: this.isTracking, source: savedState ? 'saved' : 'default' };
    }

    updateAnchor(newAnchorTime: number): CameraUpdateAction | null {
        if (!newAnchorTime || !this.chart) return null;

        const oldAnchorTime = this.lastAnchorTime;
        const anchorChanged = newAnchorTime !== oldAnchorTime;
        this.lastAnchorTime = newAnchorTime;

        if (this.userOwnsViewport) {
        } else if (this.isTracking && anchorChanged) {
            return this.enforceLivePosition(newAnchorTime, undefined, anchorChanged);
        }

        return null;
    }

    resetZoom(anchorTime: number) {
        if (!this.chart || !anchorTime) return;

        this.isTracking = true;
        this.lastAnchorTime = anchorTime;
        this.intendedSpan = DEFAULT_SPAN_SECONDS;

        const { from, to } = this.calculateTargetRange(anchorTime, this.intendedSpan);
        this.chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
        this.traceWrite('resetZoom');

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
        this.traceWrite('applyResize');
    }

    destroy() {
        this.chart = null;
    }

    private checkTrackingOnRelease(): void {
        if (!this.isTracking || !this.chart) return;

        const range = this.chart.timeScale().getVisibleRange();
        if (!range || !this.acquireRange) return;

        const moved = (range.from as number) !== this.acquireRange.from
                   || (range.to as number) !== this.acquireRange.to;

        if (moved) {
            this.isTracking = false;
        }
        this.acquireRange = null;
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
            this.traceWrite('restoreState-enforce');
        } else {
            this.isTracking = false;
        }
    }

    private enforceLivePosition(anchorTime: number, forceSpan?: number, anchorChanged = true): CameraUpdateAction {
        const fallback: CameraUpdateAction = { kind: 'enforce', anchorTime, rangeFrom: 0, rangeTo: 0, span: 0, anchorChanged };
        if (!this.chart) return fallback;

        if (forceSpan) {
            this.intendedSpan = forceSpan;
        }

        const { from, to } = this.calculateTargetRange(anchorTime, this.intendedSpan);

        this.chart.timeScale().setVisibleRange({
            from: from as UTCTimestamp,
            to: to as UTCTimestamp
        });
        this.traceWrite('enforceLivePosition');

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
        this.traceWrite('restoreGeometry');
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
