import type { IChartApi } from "lightweight-charts";
import { isIOS } from "$lib/core/utils/platform.js";
import { getTimeScaleHeight } from "$lib/components/chart-engine/config.js";
import * as CHART_CONST from '$lib/shared/constants/chart.js';
import type { ViewportService } from "$lib/core/services/ViewportService.svelte.js";

export interface ResizeCallbacks {
    onBeforeResize?: () => void;
    onAfterResize?: () => void;
}

export class ChartUI {
    isIosDevice = $state(false);
    isDataLoaded = $state(false);

    private chart: IChartApi | null = null;
    private container: HTMLDivElement | null = null;
    private callbacks: ResizeCallbacks | null = null;

    constructor(private readonly viewportService: ViewportService) {
        if (typeof window !== 'undefined') {
            this.isIosDevice = isIOS();
        }

        $effect(() => {
            const _w = this.viewportService.width;
            const _h = this.viewportService.height;

            if (this.container && this.chart) {
                this.handleResizeCycle();
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

        this.updateDimensions();
        this.removeTradingViewLogo();
    }

    setDataLoaded(loaded: boolean) {
        this.isDataLoaded = loaded;
        if (loaded) {
            setTimeout(() => {
                this.updateDimensions();
                this.enforceScrollPosition();
            }, 50);
        }
    }

    destroy() {
        if (typeof window === 'undefined') return;
        window.visualViewport?.removeEventListener('resize', this.handleZoomCheck);
    }

    private handleResizeCycle() {
        if (this.callbacks?.onBeforeResize) {
            this.callbacks.onBeforeResize();
        }

        this.updateDimensions();

        if (this.callbacks?.onAfterResize) {
            this.callbacks.onAfterResize();
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

    private enforceScrollPosition = () => {
        if (!this.shouldEnforceScroll()) return;

        const target = this.getScrollTarget();

        if (window.scrollY < target) {
            window.scrollTo({ top: target, behavior: 'instant' });
        }
    };

    private shouldEnforceScroll(): boolean {
        if (!this.isIosDevice || !this.isDataLoaded || !this.container) return false;

        if (this.isUserZoomedIn()) return false;

        return true;
    }

    private isUserZoomedIn(): boolean {
        return !!(window.visualViewport && window.visualViewport.scale > 1.01);
    }

    private getScrollTarget(): number {
        if (!this.container) return 0;
        return CHART_CONST.TOPBAR_HEIGHT + (this.container.clientHeight - window.innerHeight);
    }

    private updateDimensions() {
        if (!this.container || !this.chart) return;

        const width = this.viewportService.width;
        const height = this.viewportService.height;

        this.updateContainerSize(width, height);
        this.resizeChart(width, height);
        this.updateTimeScaleOptions(width, height);

        this.enforceScrollPosition();
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
        const isMobile = width <= 768;
        const isLandscape = width > height;
        const isAppMode = this.isIosDevice;

        this.chart?.applyOptions({
            timeScale: {
                minimumHeight: getTimeScaleHeight(isAppMode, isLandscape),
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