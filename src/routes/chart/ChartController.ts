import {
    createChart,
    CandlestickSeries,
    type IChartApi,
    type ISeriesApi,
    type MouseEventParams,
    type IRange
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
        // Note: IPriceScaleApi.getVisibleRange() returns IRange<number> | null
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
        // Note: IPriceScaleApi.setVisibleRange(range: IRange<number>)
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
        // Toggling autoScale off then on usually resets manual overrides
        const ps = this._chart.priceScale('right');
        ps.applyOptions({ autoScale: true });
    }

    subscribeCameraChange(handler: () => void) {
        if (!this._chart) return;

        // Listen to TimeScale changes
        this._chart.timeScale().subscribeVisibleLogicalRangeChange(handler);

        // There is no direct subscription for PriceScale changes in the public API provided.
        // We rely on time scale changes (zoom usually affects both) or save manually on interactions.
        // For a robust solution, we can just save state periodically or on other events if needed,
        // but for now, we attach to time scale.
    }

    destroy() {
        if (this._chart) {
            this._chart.remove();
            this._chart = null;
            this._series = null;
        }
    }
}