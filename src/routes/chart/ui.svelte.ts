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
            // Reactive dependency on viewport changes via injected service
            const width = this.viewportService.width;
            const height = this.viewportService.height;
            const maxW = this.viewportService.maxWidth;
            const maxH = this.viewportService.maxHeight;

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

                // 1. Prevention
                document.addEventListener('gesturestart', this.preventZoom);
                document.addEventListener('gesturechange', this.preventZoom);
                document.addEventListener('gestureend', this.preventZoom);

                // 2. Cure
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

    private handleZoomCheck = () => {
        if (!window.visualViewport) return;
        const currentScale = window.visualViewport.scale;

        if (Math.abs(currentScale - 1.0) > 0.05) {
            console.warn(`[Zoom Watchdog] Drift ${currentScale} detected. Thrashing layout.`);
            document.body.style.display = 'none';
            void document.body.offsetHeight;
            document.body.style.display = '';
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
            const dims = this.viewportService.getChartDimensions();
            width = dims.width;
            height = dims.height;
        } else {
            width = this.viewportService.width;
            height = this.viewportService.height;
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