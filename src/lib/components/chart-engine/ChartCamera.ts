import type { IChartApi, IRange, Time, UTCTimestamp } from 'lightweight-charts';
import * as CHART_CONST from '$lib/shared/constants/chart.js';
import { viewport } from '$lib/core/services/ViewportService.svelte.js';
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';

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
}

const DEFAULT_SPAN_SECONDS = 120 * 60;

export class ChartCamera {
    private chart: IChartApi | null = null;

    private isTracking = true;

    private lastAnchorTime: number | null = null;

    init(chart: IChartApi) {
        this.chart = chart;

        this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
            this.handleUserInteraction();
        });
    }

    initializeView(savedState: ViewState | null, liveTime: number) {
        if (!this.chart) return;

        this.lastAnchorTime = liveTime;

        if (savedState) {
            this.restoreState(savedState, liveTime);
        } else {
            this.resetZoom(liveTime);
        }
    }

    maintainScrollPosition(barsAdded: number): { before: { from: number; to: number } | null; after: { from: number; to: number } | null } {
        if (!this.chart || barsAdded <= 0) return { before: null, after: null };

        const timeScale = this.chart.timeScale();
        const currentRange = timeScale.getVisibleLogicalRange();

        if (!currentRange) return { before: null, after: null };

        const before = { from: currentRange.from, to: currentRange.to };
        const newRange = { from: currentRange.from + barsAdded, to: currentRange.to + barsAdded };
        timeScale.setVisibleLogicalRange(newRange);
        return { before, after: newRange };
    }

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

    resetZoom(anchorTime: number) {
        if (!this.chart || !anchorTime) return;

        this.isTracking = true;
        this.lastAnchorTime = anchorTime;

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

    captureViewport(): CapturedViewport | null {
        if (!this.chart) return null;

        const barSpacing = this.chart.timeScale().options().barSpacing;
        const apiRange = this.chart.priceScale('right').getVisibleRange();

        if (!apiRange) return null;

        return { barSpacing, apiPriceFrom: apiRange.from, apiPriceTo: apiRange.to };
    }

    applyResize(captured: CapturedViewport) {
        if (!this.chart) return;

        this.chart.applyOptions({
            timeScale: { barSpacing: captured.barSpacing }
        });

        this.chart.priceScale('right').applyOptions({ autoScale: false });
        this.chart.priceScale('right').setVisibleRange({
            from: captured.apiPriceFrom,
            to: captured.apiPriceTo
        });

        serverLog({
            tag: LogEvent.ChartResize,
            phase: 'apply',
            set: { top: Math.round(captured.apiPriceTo), bot: Math.round(captured.apiPriceFrom), span: Math.round(captured.apiPriceTo - captured.apiPriceFrom) },
        });
    }

    destroy() {
        this.chart = null;
    }

    private checkAndApplyPassiveFollow(oldTime: number, newTime: number) {
        if (!this.chart) return;
        const timeScale = this.chart.timeScale();
        const range = timeScale.getVisibleRange();

        if (!range) return;

        const visibleFrom = range.from as number;
        const visibleTo = range.to as number;

        const buffer = (visibleTo - visibleFrom) * 0.05;
        const isLiveVisible = (oldTime >= visibleFrom - buffer) && (oldTime <= visibleTo + buffer);

        if (isLiveVisible) {

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

        const bsBefore = timeScale.options().barSpacing;
        const { from, to } = this.calculateTargetRange(anchorTime, span);

        timeScale.setVisibleRange({
            from: from as UTCTimestamp,
            to: to as UTCTimestamp
        });

        const bsAfter = timeScale.options().barSpacing;
        if (Math.abs(bsAfter - bsBefore) > 0.01) {
            serverLog({
                tag: LogEvent.ChartResize,
                phase: 'enforceLive-changed-bs',
                bsBefore,
                bsAfter,
                span,
                viewportWidth: viewport.width,
            });
        }
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
