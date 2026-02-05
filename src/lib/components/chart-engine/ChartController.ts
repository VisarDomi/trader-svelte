import {
    createChart,
    CandlestickSeries,
    LineSeries,
    type IChartApi,
    type ISeriesApi,
    type MouseEventParams,
    type UTCTimestamp,
    type IRange,
    type Time
} from 'lightweight-charts';
import { getChartOptions, getBaseSeriesOptions } from "$lib/components/chart-engine/config.js";
import { isIOS } from "$lib/core/utils/platform.js";
import { viewport } from "$lib/core/services/ViewportService.svelte.js";
import * as CHART_CONST from '$lib/shared/constants/chart.js';

export interface ViewState {
    centerTime: number;
    timeSpan: number;
    centerPrice: number;
    priceSpan: number;
}

export class ChartController {
    private _chart: IChartApi | null = null;
    private _series: ISeriesApi<"Candlestick"> | null = null;
    private _ghostSeries: ISeriesApi<"Line"> | null = null;

    get chart() {
        if (!this._chart) throw new Error("Chart not initialized");
        return this._chart;
    }

    get series() {
        if (!this._series) throw new Error("Series not initialized");
        return this._series;
    }

    init(container: HTMLDivElement) {
        const width = viewport.width;
        const height = viewport.height;
        const isIos = isIOS();

        const config = {
            width,
            height,
            isPwa: isIos,
            isMobile: width <= 768,
            isLandscape: width > height
        };

        this._chart = createChart(container, getChartOptions(config));
    }

    createMainSeries(precision: number) {
        if (!this._chart) return;

        // If series exists, just update its options
        if (this._series) {
            this._series.applyOptions(getBaseSeriesOptions(precision));
            return;
        }

        this._series = this._chart.addSeries(CandlestickSeries, getBaseSeriesOptions(precision));
    }

    extendTimeScale24H(anchorPrice: number) {
        if (!this._chart) return;

        this.ensureGhostSeriesExists();
        const data = this.generateGhostData(anchorPrice);
        this._ghostSeries!.setData(data);
    }

    subscribeClick(handler: (param: MouseEventParams) => void) {
        this._chart?.subscribeClick(handler);
    }

    unsubscribeClick(handler: (param: MouseEventParams) => void) {
        this._chart?.unsubscribeClick(handler);
    }

    getViewState(): ViewState | null {
        if (!this._chart) return null;

        const timeRange = this._chart.timeScale().getVisibleRange();
        const priceScale = this._chart.priceScale('right');
        const priceRange = priceScale.getVisibleRange();

        if (!timeRange || !priceRange) return null;

        return {
            ...this.calculateTimeState(timeRange),
            ...this.calculatePriceState(priceRange)
        };
    }

    restoreViewState(state: ViewState) {
        if (!this._chart) return;

        this._chart.priceScale('right').applyOptions({ autoScale: false });

        const pHalf = state.priceSpan / 2;
        this._chart.priceScale('right').setVisibleRange({
            from: state.centerPrice - pHalf,
            to: state.centerPrice + pHalf
        });

        const tHalf = state.timeSpan / 2;
        this._chart.timeScale().setVisibleRange({
            from: (state.centerTime - tHalf) as UTCTimestamp,
            to: (state.centerTime + tHalf) as UTCTimestamp
        });
    }

    resetZoom() {
        if (!this._chart) return;

        const timeScale = this._chart.timeScale();
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;

        const span = this.determineZoomSpan(timeScale.getVisibleRange());

        // Temporarily set range to 'now' to calculate pixel accuracy
        timeScale.setVisibleRange({
            from: (now - span) as UTCTimestamp,
            to: now
        });

        const bufferSeconds = this.calculateRightEdgeBuffer(timeScale, span);
        const finalTo = (now + bufferSeconds) as UTCTimestamp;

        timeScale.setVisibleRange({
            from: (finalTo - span) as UTCTimestamp,
            to: finalTo
        });

        this._chart.priceScale('right').applyOptions({ autoScale: true });
    }

    subscribeCameraChange(handler: () => void) {
        if (!this._chart) return;
        this._chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    }

    destroy() {
        if (this._chart) {
            this._chart.remove();
            this._chart = null;
            this._series = null;
            this._ghostSeries = null;
        }
    }

    private ensureGhostSeriesExists() {
        if (this._ghostSeries) return;

        this._ghostSeries = this._chart!.addSeries(LineSeries, {
            color: 'transparent',
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            visible: true,
            priceScaleId: 'ghost_scale',
            autoscaleInfoProvider: () => null
        });

        this._chart!.priceScale('ghost_scale').applyOptions({
            visible: false,
            autoScale: true
        });
    }

    private generateGhostData(anchorPrice: number) {
        const now = Math.floor(Date.now() / 1000 / 60) * 60;
        const start = now + 60;
        const oneDaySeconds = 24 * 60 * 60;
        const limit = start + oneDaySeconds;

        const data = [];
        for (let t = start; t <= limit; t += 60) {
            data.push({
                time: t as UTCTimestamp,
                value: anchorPrice
            });
        }
        return data;
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

    private determineZoomSpan(currentRange: IRange<Time> | null): number {
        const defaultSpan = 2 * 60 * 60; // 2 hours
        if (!currentRange) return defaultSpan;

        const span = (currentRange.to as number) - (currentRange.from as number);
        return span > 0 ? span : defaultSpan;
    }

    private calculateRightEdgeBuffer(timeScale: any, span: number): number {
        const chartWidth = timeScale.width();
        const offsetPixels = CHART_CONST.RESET_RIGHT_OFFSET_PIXELS;

        const tRight = timeScale.coordinateToTime(chartWidth);
        const tOffset = timeScale.coordinateToTime(chartWidth - offsetPixels);

        if (tRight && tOffset) {
            return (tRight as number) - (tOffset as number);
        }

        return offsetPixels * (span / chartWidth);
    }
}