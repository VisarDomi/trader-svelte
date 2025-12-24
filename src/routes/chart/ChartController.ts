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

    /**
     * Sets the visible range to end at the specific target time.
     * Preserves the current zoom span (width of the view).
     */
    scrollToTimestamp(target: UTCTimestamp) {
        if (!this._chart) return;

        const timeScale = this._chart.timeScale();
        const currentRange = timeScale.getVisibleRange();

        // Default span (2 hours) if chart is not yet rendered
        let span = 2 * 60 * 60;

        if (currentRange) {
            span = (currentRange.to as number) - (currentRange.from as number);
        }

        // Ensure we don't have a 0 or negative span
        if (span <= 0) span = 2 * 60 * 60;

        timeScale.setVisibleRange({
            from: (target - span) as UTCTimestamp,
            to: target as UTCTimestamp
        });
    }

    subscribeClick(handler: (param: MouseEventParams) => void) {
        this._chart?.subscribeClick(handler);
    }

    unsubscribeClick(handler: (param: MouseEventParams) => void) {
        this._chart?.unsubscribeClick(handler);
    }

    // --- Zoom / State Logic ---

    getState(): ChartState | null {
        if (!this._chart) return null;

        const timeRange = this._chart.timeScale().getVisibleLogicalRange();
        const timeSpan = timeRange ? (timeRange.to - timeRange.from) : 0;

        const priceScale = this._chart.priceScale('right');
        const priceRange = priceScale.getVisibleRange();

        return {
            timeSpan,
            priceRange: priceRange ? { min: priceRange.from, max: priceRange.to } : null
        };
    }

    restoreState(state: ChartState) {
        if (!this._chart) return;

        if (state.priceRange) {
            this._chart.priceScale('right').setVisibleRange({
                from: state.priceRange.min,
                to: state.priceRange.max
            });
        } else {
            this._chart.priceScale('right').applyOptions({ autoScale: true });
        }

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

        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        this.scrollToTimestamp(now);

        // Reset Price
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