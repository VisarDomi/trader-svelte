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

export interface ChartState {
    timeSpan: number;
    priceRange: { min: number, max: number } | null;
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
     *
     * FIX: Uses a separate 'ghost' priceScaleId to prevent squashing the main chart.
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
                priceScaleId: 'ghost_scale', // CRITICAL: Isolate to custom scale
                autoscaleInfoProvider: () => null // Double-safety: ignore for auto-scaling
            });

            // Ensure the ghost scale itself is hidden so it doesn't show numbers
            this._chart.priceScale('ghost_scale').applyOptions({
                visible: false,
                autoScale: true
            });
        }

        // Start 1 minute in the future to avoid collision with the live candle
        const now = Math.floor(Date.now() / 1000 / 60) * 60;
        const start = now + 60;
        const oneDaySeconds = 24 * 60 * 60;
        const limit = start + oneDaySeconds;

        const data = [];
        // Generate points for every minute from Now+1m to Now+24H
        for (let t = start; t <= limit; t += 60) {
            data.push({
                time: t as UTCTimestamp,
                value: anchorPrice // Value doesn't matter much on hidden scale, but keep it steady
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

    // --- Zoom / State Logic ---

    /**
     * Captures both TimeScale (zoom) and PriceScale (vertical zoom/scroll)
     */
    getState(): ChartState | null {
        if (!this._chart) return null;

        // 1. Time Span
        const timeRange = this._chart.timeScale().getVisibleLogicalRange();
        const timeSpan = timeRange ? (timeRange.to - timeRange.from) : 0;

        // 2. Price Range (Right scale)
        const priceScale = this._chart.priceScale('right');
        const priceRange = priceScale.getVisibleRange();

        return {
            timeSpan,
            priceRange: priceRange ? { min: priceRange.from, max: priceRange.to } : null
        };
    }

    /**
     * Restores state. Should be called AFTER data is loaded.
     */
    restoreState(state: ChartState) {
        if (!this._chart) return;

        // 1. Restore Price Scale
        if (state.priceRange) {
            this._chart.priceScale('right').setVisibleRange({
                from: state.priceRange.min,
                to: state.priceRange.max
            });
        } else {
            this._chart.priceScale('right').applyOptions({ autoScale: true });
        }

        // 2. Restore Time Scale (Span from right)
        if (state.timeSpan > 0) {
            const current = this._chart.timeScale().getVisibleLogicalRange();
            if (current) {
                this._chart.timeScale().setVisibleLogicalRange({
                    from: current.to - state.timeSpan,
                    to: current.to
                });
            }
        }
    }

    resetZoom() {
        if (!this._chart) return;

        // Reset Time
        this._chart.timeScale().scrollToRealTime();
        this._chart.timeScale().resetTimeScale();

        // Reset Price (Force AutoScale)
        const ps = this._chart.priceScale('right');
        ps.applyOptions({ autoScale: true });
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