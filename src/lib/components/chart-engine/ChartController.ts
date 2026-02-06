import {
    createChart,
    CandlestickSeries,
    LineSeries,
    type IChartApi,
    type ISeriesApi,
    type MouseEventParams,
    type UTCTimestamp
} from 'lightweight-charts';
import { getChartOptions, getBaseSeriesOptions } from "$lib/components/chart-engine/config.js";
import { isIOS } from "$lib/core/utils/platform.js";
import { viewport } from "$lib/core/services/ViewportService.svelte.js";
import { ChartCamera } from "$lib/components/chart-engine/ChartCamera.js";
import type { ChartCandle } from '$lib/shared/types/market.js';

/**
 * ARCHITECTURE DECISION: ATOMIC HISTORY LOADING
 *
 * Standard LWC behavior resets the view to Index 0 when data is prepended.
 * Reactive updates via Svelte $effects are too slow (microtasks), causing
 * a visible "teleportation" glitch during scrolling.
 *
 * We solve this by bypassing the reactive render loop for history prepends.
 * The MarketDataPump calls `prependData` DIRECTLY.
 * This method updates the data and shifts the viewport in the SAME execution frame.
 */
export class ChartController {
    private _chart: IChartApi | null = null;
    private _series: ISeriesApi<"Candlestick"> | null = null;
    private _ghostSeries: ISeriesApi<"Line"> | null = null;

    // Publicly expose the Camera for Orchestrators to use
    public readonly camera = new ChartCamera();

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

        // Hand over the instance to the Camera
        this.camera.init(this._chart);
    }

    /**
     * SYNCHRONOUS HISTORY INJECTION
     * Must be called directly by the data source, bypassing reactive effects.
     *
     * @param mergedData - The full dataset (Old + New History)
     * @param newCandleCount - How many candles were added to the left
     */
    prependData(mergedData: ChartCandle[], newCandleCount: number) {
        if (!this._chart || !this._series) return;

        // 1. Capture current logical range (Where the user is looking)
        const timeScale = this._chart.timeScale();
        const currentRange = timeScale.getVisibleLogicalRange();

        // 2. Atomic Update: Set Data
        // This internally shifts the indices of existing bars by +newCandleCount
        this._series.setData(mergedData);

        // 3. Atomic Update: Shift View
        // We immediately correct the camera to look at the new indices of the *same* candles.
        if (currentRange) {
            timeScale.setVisibleLogicalRange({
                from: currentRange.from + newCandleCount,
                to: currentRange.to + newCandleCount
            });
        }
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

    subscribeCameraChange(handler: () => void) {
        if (!this._chart) return;
        this._chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    }

    destroy() {
        this.camera.destroy();

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
}