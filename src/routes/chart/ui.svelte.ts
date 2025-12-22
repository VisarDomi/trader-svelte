import type { IChartApi } from "lightweight-charts";
import { isIOS, isPWA } from "$lib/utils/platform.js";
import { viewport } from "$lib/services/viewport.svelte.js";
import { getTimeScaleHeight } from "$lib/utils/chart.js";
import * as CHART_CONST from '$lib/constants/chart.js';

export class ChartUI {
    isIosDevice = $state(false);
    isPwa = $state(false);
    isDataLoaded = $state(false);
    private chart: IChartApi | null = null;
    private container: HTMLDivElement | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            this.isIosDevice = isIOS();
            this.isPwa = isPWA();
        }

        $effect(() => {
            // Reactive dependency on viewport changes
            const width = viewport.width;
            const height = viewport.height;
            const maxW = viewport.maxWidth;
            const maxH = viewport.maxHeight;

            if (this.container && this.chart) {
                this.updateDimensions();
            }
        });
    }

    init(chart: IChartApi, container: HTMLDivElement) {
        this.chart = chart;
        this.container = container;

        if (typeof window !== 'undefined') {
            if (this.isIosDevice && this.isPwa) {
                window.addEventListener('scroll', this.handleScroll);

                // 1. Prevention: Stop iOS from interpreting gestures as zoom
                document.addEventListener('gesturestart', this.preventZoom);
                document.addEventListener('gesturechange', this.preventZoom);
                document.addEventListener('gestureend', this.preventZoom);

                // 2. Cure: Watch for drift and force reflow
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

    private preventZoom = (e: Event) => {
        e.preventDefault();
    };

    /**
     * JS Solution for "Stuck Zoom":
     * If Visual Viewport scale drifts, we perform a "Layout Thrash".
     * Hiding the body forces the render engine to discard the current bad frame
     * and recalculate the viewport relative to the screen dimensions.
     */
    private handleZoomCheck = () => {
        if (!window.visualViewport) return;

        const currentScale = window.visualViewport.scale;

        // Threshold check (1.0 vs 1.389 etc)
        if (Math.abs(currentScale - 1.0) > 0.05) {
            console.warn(`[Zoom Watchdog] Drift ${currentScale} detected. Thrashing layout.`);

            // 1. Force hard reset of display
            document.body.style.display = 'none';

            // 2. Force synchronous reflow (read a geometric property)
            // This makes the browser apply the 'none' immediately
            void document.body.offsetHeight;

            // 3. Restore
            document.body.style.display = '';

            // 4. Force scroll reset
            window.scrollTo(0, 0);
        }
    };

    private getScrollTarget(chartH: number, winH: number): number {
        return CHART_CONST.TOPBAR_HEIGHT + (chartH - winH);
    }

    private handleScroll = () => {
        if (!this.isIosDevice || !this.isPwa || !this.isDataLoaded || !this.container) return;
        const chartH = this.container.clientHeight;
        const winH = window.innerHeight;
        const target = this.getScrollTarget(chartH, winH);

        if (window.scrollY < target) {
            window.scrollTo({
                top: target,
                behavior: 'instant'
            });
        }
    };

    private updateDimensions() {
        if (!this.container || !this.chart) return;

        let width: number;
        let height: number;

        if (this.isIosDevice && this.isPwa && this.isDataLoaded) {
            const dims = viewport.getChartDimensions();
            width = dims.width;
            height = dims.height;
        } else {
            width = viewport.width;
            height = viewport.height;
        }

        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;
        this.chart.resize(width, height);

        const isMobile = width <= 768;
        this.chart.applyOptions({
            timeScale: {
                minimumHeight: getTimeScaleHeight(),
                barSpacing: isMobile ? CHART_CONST.MOBILE_BAR_SPACING : CHART_CONST.BAR_SPACING
            }
        });

        if (this.isIosDevice && this.isPwa && this.isDataLoaded) {
            const scrollTarget = this.getScrollTarget(height, window.innerHeight);
            window.scrollTo({
                top: scrollTarget,
                behavior: 'instant'
            });
        }
    }

    private removeTradingViewLogo() {
        const delay = 100;
        const maxAttempts = 20;
        let attempts = 0;
        const tryToRemove = () => {
            attempts++;
            const logo = document.querySelector('a[href*="tradingview"]');
            if (logo && logo.parentNode) {
                logo.parentNode.removeChild(logo);
                return;
            }
            if (attempts < maxAttempts) {
                setTimeout(tryToRemove, delay);
            }
        };
        setTimeout(tryToRemove, delay);
    }
}