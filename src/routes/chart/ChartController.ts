import {
    createChart,
    CandlestickSeries,
    LineSeries,
    type IChartApi,
    type ISeriesApi,
    type MouseEventParams,
    type UTCTimestamp
} from 'lightweight-charts';
import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
import { isIOS } from "$lib/utils/platform.js";
import { viewport } from "$lib/services/viewport.svelte.js";
import * as CHART_CONST from '$lib/constants/chart.js';

// We store Center + Span to be resilient to aspect ratio changes
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
        this._series = this._chart.addSeries(CandlestickSeries, getBaseSeriesOptions(precision));
    }

    /**
     * EXTENSION: Populates an invisible series with 24 hours of minute data
     * into the future to force the TimeScale to render continuous time.
     */
    extendTimeScale24H(anchorPrice: number) {
        if (!this._chart) return;

        // Create the ghost series if it doesn't exist
        if (!this._ghostSeries) {
            this._ghostSeries = this._chart.addSeries(LineSeries, {
                color: 'transparent', // Invisible
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false,
                visible: true, // Must be true for TimeScale to acknowledge it
                priceScaleId: 'ghost_scale', // Isolate to custom scale
                autoscaleInfoProvider: () => null // Double-safety: ignore for auto-scaling
            });

            // Ensure the ghost scale itself is hidden
            this._chart.priceScale('ghost_scale').applyOptions({
                visible: false,
                autoScale: true
            });
        }

        const now = Math.floor(Date.now() / 1000 / 60) * 60;
        const start = now + 60; // Start 1 min in future
        const oneDaySeconds = 24 * 60 * 60;
        const limit = start + oneDaySeconds;

        const data = [];
        for (let t = start; t <= limit; t += 60) {
            data.push({
                time: t as UTCTimestamp,
                value: anchorPrice
            });
        }

        this._ghostSeries.setData(data);
    }

    subscribeClick(handler: (param: MouseEventParams) => void) {
        this._chart?.subscribeClick(handler);
    }

    unsubscribeClick(handler: (param: MouseEventParams) => void) {
        this._chart?.unsubscribeClick(handler);
    }

    // --- State Management (Center/Span Strategy) ---

    getViewState(): ViewState | null {
        if (!this._chart) return null;

        const timeRange = this._chart.timeScale().getVisibleRange();
        const priceScale = this._chart.priceScale('right');
        const priceRange = priceScale.getVisibleRange();

        if (!timeRange || !priceRange) return null;

        // Calculate Time Center
        const tFrom = timeRange.from as number;
        const tTo = timeRange.to as number;
        const timeSpan = tTo - tFrom;
        const centerTime = tFrom + (timeSpan / 2);

        // Calculate Price Center
        const pMin = priceRange.from;
        const pMax = priceRange.to;
        const priceSpan = pMax - pMin;
        const centerPrice = pMin + (priceSpan / 2);

        return {
            centerTime,
            timeSpan,
            centerPrice,
            priceSpan
        };
    }

    restoreViewState(state: ViewState) {
        if (!this._chart) return;

        // Restore Price (Centered)
        // CRITICAL: Disable autoScale to prevent LWC from overriding our manual range immediately
        this._chart.priceScale('right').applyOptions({
            autoScale: false
        });

        const pHalf = state.priceSpan / 2;
        this._chart.priceScale('right').setVisibleRange({
            from: state.centerPrice - pHalf,
            to: state.centerPrice + pHalf
        });

        // Restore Time (Centered)
        // This explicitly overrides auto-scaling, preventing the Ghost Series jump
        const tHalf = state.timeSpan / 2;
        this._chart.timeScale().setVisibleRange({
            from: (state.centerTime - tHalf) as UTCTimestamp,
            to: (state.centerTime + tHalf) as UTCTimestamp
        });
    }

    resetZoom() {
        if (!this._chart) return;

        const timeScale = this._chart.timeScale();
        const currentRange = timeScale.getVisibleRange();

        // 1. Determine Span (Zoom Level)
        let span = 2 * 60 * 60; // Default 2 hours
        if (currentRange) {
            span = (currentRange.to as number) - (currentRange.from as number);
        }
        if (span <= 0) span = 2 * 60 * 60;

        // 2. Set temporary range ending at NOW (right edge = now)
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        timeScale.setVisibleRange({
            from: (now - span) as UTCTimestamp,
            to: now
        });

        // 3. Calculate Buffer based on Configured Pixel Offset
        const chartWidth = this._chart.timeScale().width();
        const offsetPixels = CHART_CONST.RESET_RIGHT_OFFSET_PIXELS;

        // Calculate logical buffer (in seconds)
        // Coordinate API is most accurate:
        const tRight = timeScale.coordinateToTime(chartWidth);
        const tOffset = timeScale.coordinateToTime(chartWidth - offsetPixels);

        let bufferSeconds = 0;
        if (tRight && tOffset) {
            bufferSeconds = (tRight as number) - (tOffset as number);
        } else {
            // Fallback: Proportional calculation
            bufferSeconds = offsetPixels * (span / chartWidth);
        }

        // 4. Apply Final Range
        const finalTo = (now + bufferSeconds) as UTCTimestamp;
        timeScale.setVisibleRange({
            from: (finalTo - span) as UTCTimestamp,
            to: finalTo
        });

        // 5. Reset Price Scale
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
}