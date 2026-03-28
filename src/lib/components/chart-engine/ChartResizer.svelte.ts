import type { IChartApi } from "lightweight-charts";
import { isIOS } from "$lib/core/utils/platform.js";
import { getTimeScaleHeight } from "$lib/components/chart-engine/config.js";
import * as CHART_CONST from '$lib/shared/constants/chart.js';
import type { ViewportService } from "$lib/core/services/ViewportService.svelte.js";
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';

export interface ResizeCallbacks {
    onBeforeResize?: (oldWidth: number, oldHeight: number) => void;
    onAfterResize?: (newWidth: number, newHeight: number) => void;
}

export class ChartUI {
    isIosDevice = $state(false);
    isDataLoaded = $state(false);

    private chart: IChartApi | null = null;
    private container: HTMLDivElement | null = null;
    private callbacks: ResizeCallbacks | null = null;
    private lastWidth = 0;
    private lastHeight = 0;

    constructor(private readonly viewportService: ViewportService) {
        if (typeof window !== 'undefined') {
            this.isIosDevice = isIOS();
        }

        $effect(() => {
            const newW = this.viewportService.width;
            const newH = this.viewportService.height;

            if (this.container && this.chart) {
                this.handleResizeCycle(newW, newH);
            }
        });
    }

    init(chart: IChartApi, container: HTMLDivElement, callbacks?: ResizeCallbacks) {
        this.chart = chart;
        this.container = container;
        if (callbacks) this.callbacks = callbacks;

        if (typeof window !== 'undefined' && this.isIosDevice) {
            this.setupIosHacks();
        }

        this.lastWidth = this.viewportService.width;
        this.lastHeight = this.viewportService.height;
        this.updateDimensions();
        this.initBarSpacing();
        this.removeTradingViewLogo();
    }

    setDataLoaded(loaded: boolean) {
        this.isDataLoaded = loaded;
        if (loaded) {
            setTimeout(() => {
                this.updateDimensions();
            }, 50);
        }
    }

    destroy() {
        if (typeof window === 'undefined') return;
        window.visualViewport?.removeEventListener('resize', this.handleZoomCheck);
    }

    private readChartState(label: string, series?: import("lightweight-charts").ISeriesApi<"Candlestick">) {
        if (!this.chart) return;
        const ts = this.chart.timeScale();
        const timeRange = ts.getVisibleRange();
        const priceRange = this.chart.priceScale('right').getVisibleRange();
        const lr = ts.getVisibleLogicalRange();

        const toTime = (t: number) => {
            const d = new Date(t * 1000);
            return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        };

        serverLog({
            tag: LogEvent.ChartResize,
            phase: label,
            barSpacing: ts.options().barSpacing,
            tsWidth: ts.width(),
            bars: lr ? Math.round(lr.to - lr.from) : 0,
            timeLeft: timeRange ? toTime(timeRange.from as number) : null,
            timeRight: timeRange ? toTime(timeRange.to as number) : null,
            priceTop: priceRange ? Math.round(priceRange.to * 100) / 100 : null,
            priceBot: priceRange ? Math.round(priceRange.from * 100) / 100 : null,
        });
    }

    private handleResizeCycle(newW: number, newH: number) {
        const oldW = this.lastWidth;
        const oldH = this.lastHeight;

        if (oldW === newW && oldH === newH) return;

        this.readChartState(`1-before[${oldW}x${oldH}->${newW}x${newH}]`);

        if (oldW > 0 && oldH > 0) {
            this.callbacks?.onBeforeResize?.(oldW, oldH);
        }

        this.updateDimensions();

        this.readChartState('2-after-resize');

        this.lastWidth = newW;
        this.lastHeight = newH;

        if (oldW > 0 && oldH > 0) {
            this.callbacks?.onAfterResize?.(newW, newH);
        }

        this.readChartState('3-after-apply');

        const chart = this.chart;
        for (const delay of [50, 200, 500]) {
            setTimeout(() => {
                if (!chart) return;
                const ts = chart.timeScale();
                const timeRange = ts.getVisibleRange();
                const priceRange = chart.priceScale('right').getVisibleRange();
                const lr = ts.getVisibleLogicalRange();

                const toTime = (t: number) => {
                    const d = new Date(t * 1000);
                    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                };

                serverLog({
                    tag: LogEvent.ChartResize,
                    phase: `4-settled-${delay}ms`,
                    barSpacing: ts.options().barSpacing,
                    tsWidth: ts.width(),
                    bars: lr ? Math.round(lr.to - lr.from) : 0,
                    timeLeft: timeRange ? toTime(timeRange.from as number) : null,
                    timeRight: timeRange ? toTime(timeRange.to as number) : null,
                    priceTop: priceRange ? Math.round(priceRange.to * 100) / 100 : null,
                    priceBot: priceRange ? Math.round(priceRange.from * 100) / 100 : null,
                });
            }, delay);
        }
    }

    private setupIosHacks() {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        window.visualViewport?.addEventListener('resize', this.handleZoomCheck);
        setTimeout(() => this.viewportService.scan(), 100);
        setTimeout(() => this.viewportService.scan(), 500);
    }

    private handleZoomCheck = () => {
        if (!window.visualViewport) return;
    };

    private updateDimensions() {
        if (!this.container || !this.chart) return;

        const width = this.viewportService.width;
        const height = this.viewportService.height;

        this.updateContainerSize(width, height);
        this.resizeChart(width, height);
        this.updateTimeScaleOptions(width, height);
    }

    private updateContainerSize(width: number, height: number) {
        if (!this.container) return;
        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;
    }

    private resizeChart(width: number, height: number) {
        this.chart?.resize(width, height);
        this.chart?.clearCrosshairPosition();
    }

    private updateTimeScaleOptions(width: number, height: number) {
        const isLandscape = width > height;
        const isAppMode = this.isIosDevice;

        this.chart?.applyOptions({
            timeScale: {
                minimumHeight: getTimeScaleHeight(isAppMode, isLandscape),
            }
        });
    }

    private initBarSpacing() {
        const isMobile = this.viewportService.width <= 768;

        this.chart?.applyOptions({
            timeScale: {
                barSpacing: isMobile ? CHART_CONST.MOBILE_BAR_SPACING : CHART_CONST.BAR_SPACING
            }
        });
    }

    private removeTradingViewLogo() {
        const tryToRemove = () => {
            const logo = document.querySelector('a[href*="tradingview"]');
            if (logo?.parentNode) logo.parentNode.removeChild(logo);
            else setTimeout(tryToRemove, 100);
        };
        setTimeout(tryToRemove, 100);
    }
}