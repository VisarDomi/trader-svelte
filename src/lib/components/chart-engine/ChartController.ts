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
import { bus } from '$lib/core/events/globalBus.js';
import * as EVENTS from '$lib/shared/constants/events.js';
export class ChartController {
    private _chart: IChartApi | null = null;
    private _series: ISeriesApi<"Candlestick"> | null = null;
    private _ghostSeries: ISeriesApi<"Line"> | null = null;
    private crosshairBlocked = false;
    private unblockTimer: ReturnType<typeof setTimeout> | null = null;
    private cleanupBus: (() => void)[] = [];
    private chartContainer: HTMLDivElement | null = null;

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
        this.chartContainer = container;

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

        this.camera.init(this._chart);

        container.addEventListener('pointerdown', this.handlePointerDown);
        window.addEventListener('pointerup', this.handlePointerUp);
        window.addEventListener('pointercancel', this.handlePointerUp);
        container.addEventListener('wheel', this.handleWheel, { passive: true });

        this._chart.subscribeCrosshairMove((param) => {
            if (this.crosshairBlocked && param.point) {
                requestAnimationFrame(() => this._chart?.clearCrosshairPosition());
            }
        });

        this.cleanupBus.push(
            bus.on(EVENTS.OVERLAY_BLOCK_CROSSHAIR, () => {
                if (this.unblockTimer) {
                    clearTimeout(this.unblockTimer);
                    this.unblockTimer = null;
                }
                this.crosshairBlocked = true;
            }),
            bus.on(EVENTS.OVERLAY_UNBLOCK_CROSSHAIR, () => {

                this.unblockTimer = setTimeout(() => {
                    this.crosshairBlocked = false;
                    this._chart?.clearCrosshairPosition();
                }, 400);
            })
        );
    }

    createMainSeries(precision: number) {
        if (!this._chart) return;

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
        this.cleanupBus.forEach(fn => fn());
        if (this.unblockTimer) clearTimeout(this.unblockTimer);

        if (this.chartContainer) {
            this.chartContainer.removeEventListener('pointerdown', this.handlePointerDown);
            this.chartContainer.removeEventListener('wheel', this.handleWheel);
            this.chartContainer = null;
        }
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('pointercancel', this.handlePointerUp);

        if (this._chart) {
            this._chart.remove();
            this._chart = null;
            this._series = null;
            this._ghostSeries = null;
        }
    }

    private handlePointerDown = () => {
        this.camera.userAcquire();
    };

    private handlePointerUp = () => {
        this.camera.userRelease();
    };

    private handleWheel = () => {
        this.camera.userAcquire();
        this.camera.userRelease();
    };

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
