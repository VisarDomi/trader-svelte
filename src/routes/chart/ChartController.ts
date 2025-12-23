import {
    createChart,
    CandlestickSeries,
    type IChartApi,
    type ISeriesApi,
    type MouseEventParams
} from 'lightweight-charts';
import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
import { isIOS } from "$lib/utils/platform.js";
import { viewport } from "$lib/services/viewport.svelte.js";

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
            // We treat all iOS as "PWA/App" mode for density config
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

    destroy() {
        if (this._chart) {
            this._chart.remove();
            this._chart = null;
            this._series = null;
        }
    }
}