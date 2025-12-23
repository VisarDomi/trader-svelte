import type { IChartApi } from "lightweight-charts";
import { isIOS, isPWA } from "$lib/utils/platform.js";
import { getTimeScaleHeight } from "$lib/utils/chart.js";
import * as CHART_CONST from '$lib/constants/chart.js';
import type { ViewportService } from "$lib/services/viewport.svelte.js";

export class ChartUI {
    isIosDevice = $state(false);
    isPwa = $state(false);
    isDataLoaded = $state(false);
    private chart: IChartApi | null = null;
    private container: HTMLDivElement | null = null;

    constructor(private readonly viewportService: ViewportService) {
        if (typeof window !== 'undefined') {
            this.isIosDevice = isIOS();
            this.isPwa = isPWA();
        }

        $effect(() => {
            const _w = this.viewportService.width;
            const _h = this.viewportService.height;

            if (this.container && this.chart) {
                this.updateDimensions();
            }
        });
    }

    init(chart: IChartApi, container: HTMLDivElement) {
        this.chart = chart;
        this.container = container;

        if (typeof window !== 'undefined' && this.isIosDevice) {
            // CURE: Check if we arrived zoomed in, and force a reset
            this.forceZoomReset();

            if (this.isPwa) {
                window.addEventListener('scroll', this.handleScroll);
                document.addEventListener('gesturestart', this.preventZoom);
                document.addEventListener('gesturechange', this.preventZoom);
                document.addEventListener('gestureend', this.preventZoom);
                window.visualViewport?.addEventListener('resize', this.handleZoomCheck);
                window.visualViewport?.addEventListener('scroll', this.handleZoomCheck);
            }
        }

        this.updateDimensions();
        this.removeTradingViewLogo();
    }

    setDataLoaded(loaded: boolean) {
        this.isDataLoaded = loaded;
        if (loaded) {
            setTimeout(() => this.updateDimensions(), 0);
        }
    }

    destroy() {
        if (typeof window === 'undefined') return;
        window.removeEventListener('scroll', this.handleScroll);
        document.removeEventListener('gesturestart', this.preventZoom);
        document.removeEventListener('gesturechange', this.preventZoom);
        document.removeEventListener('gestureend', this.preventZoom);
        window.visualViewport?.removeEventListener('resize', this.handleZoomCheck);
        window.visualViewport?.removeEventListener('scroll', this.handleZoomCheck);
    }

    private forceZoomReset() {
        // If we are already at scale 1, do nothing
        if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) < 0.01) return;

        const meta = document.querySelector('meta[name="viewport"]');
        if (!meta) return;

        // The "Hammer": Force maximum-scale=1. This forces iOS to snap back to 1.0 immediately.
        // We also disable user-scaling to prevent accidental pinches on the chart container.
        meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    }

    private preventZoom = (e: Event) => {
        e.preventDefault();
    };

    private handleZoomCheck = () => {
        if (!window.visualViewport) return;

        // If the user somehow manages to zoom in despite our blocks, we force reset again.
        if (Math.abs(window.visualViewport.scale - 1.0) > 0.05) {
            console.warn("Zoom drift detected. Resetting.");
            this.forceZoomReset();
        }
    };

    private getScrollTarget(chartH: number, winH: number): number {
        return CHART_CONST.TOPBAR_HEIGHT + (chartH - winH);
    }

    private handleScroll = () => {
        if (!this.isIosDevice || !this.isPwa || !this.isDataLoaded || !this.container) return;
        const target = this.getScrollTarget(this.container.clientHeight, window.innerHeight);

        if (window.scrollY < target) {
            window.scrollTo({ top: target, behavior: 'instant' });
        }
    };

    private updateDimensions() {
        if (!this.container || !this.chart) return;

        let width = this.viewportService.width;
        let height = this.viewportService.height;

        if (this.isIosDevice && this.isPwa && this.isDataLoaded) {
            const dims = this.viewportService.getChartDimensions();
            width = dims.width;
            height = dims.height;
        }

        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;

        this.chart.resize(width, height);

        const isMobile = width <= 768;
        const isLandscape = width > height;

        this.chart.applyOptions({
            timeScale: {
                minimumHeight: getTimeScaleHeight(this.isPwa, isLandscape),
                barSpacing: isMobile ? CHART_CONST.MOBILE_BAR_SPACING : CHART_CONST.BAR_SPACING
            }
        });

        if (this.isIosDevice && this.isPwa && this.isDataLoaded) {
            const scrollTarget = this.getScrollTarget(height, window.innerHeight);
            window.scrollTo({ top: scrollTarget, behavior: 'instant' });
        }
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