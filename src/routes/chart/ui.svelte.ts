import type { IChartApi } from "lightweight-charts";
import { isIOS } from "$lib/utils/platform.js";
import { getTimeScaleHeight } from "$lib/utils/chart.js";
import * as CHART_CONST from '$lib/constants/chart.js';
import type { ViewportService } from "$lib/services/viewport.svelte.js";

export class ChartUI {
    isIosDevice = $state(false);
    isDataLoaded = $state(false);

    private chart: IChartApi | null = null;
    private container: HTMLDivElement | null = null;
    private originalViewportContent: string | null = null;

    constructor(private readonly viewportService: ViewportService) {
        if (typeof window !== 'undefined') {
            this.isIosDevice = isIOS();
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
            // 1. Blur to release focus-zoom
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }

            // 2. Enforce Strict Viewport (The Clamp)
            this.enforceStrictViewport();

            // 3. Listeners
            // REMOVED: window.addEventListener('scroll', this.handleScroll); -> Causes fighting loop
            document.addEventListener('gesturestart', this.preventZoom);
            document.addEventListener('gesturechange', this.preventZoom);
            document.addEventListener('gestureend', this.preventZoom);
            window.visualViewport?.addEventListener('resize', this.handleZoomCheck);

            // Only use visualViewport scroll to detect major shifts, not to enforce position
            // window.visualViewport?.addEventListener('scroll', this.handleZoomCheck);

            // 4. Force Scans
            setTimeout(() => this.viewportService.scan(), 100);
            setTimeout(() => this.viewportService.scan(), 500);
        }

        this.updateDimensions();
        this.removeTradingViewLogo();
    }

    setDataLoaded(loaded: boolean) {
        this.isDataLoaded = loaded;
        if (loaded) {
            setTimeout(() => {
                this.updateDimensions();
                // Enforce scroll ONLY once when data is ready
                if (this.isIosDevice) {
                    this.enforceScrollPosition();
                }
            }, 50);
        }
    }

    destroy() {
        if (typeof window === 'undefined') return;

        this.restoreViewport();

        // window.removeEventListener('scroll', this.handleScroll);
        document.removeEventListener('gesturestart', this.preventZoom);
        document.removeEventListener('gesturechange', this.preventZoom);
        document.removeEventListener('gestureend', this.preventZoom);
        window.visualViewport?.removeEventListener('resize', this.handleZoomCheck);
    }

    private enforceStrictViewport() {
        const meta = document.querySelector('meta[name="viewport"]');
        if (!meta) return;

        if (!this.originalViewportContent) {
            this.originalViewportContent = meta.getAttribute('content');
        }

        // We use the existing tag but update attributes to force the clamp
        meta.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    }

    private restoreViewport() {
        if (!this.originalViewportContent) return;
        const meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
            meta.setAttribute('content', this.originalViewportContent);
        }
    }

    private preventZoom = (e: Event) => {
        e.preventDefault();
    };

    private handleZoomCheck = () => {
        if (!window.visualViewport) return;

        if (Math.abs(window.visualViewport.scale - 1.0) > 0.05) {
            // Re-apply clamp if drift detected
            this.enforceStrictViewport();
        } else {
            // If we are back to 1.0, ensure we are scrolled correctly
            // Debounce this to avoid loops
            // setTimeout(() => this.enforceScrollPosition(), 100);
        }
    };

    private getScrollTarget(chartH: number, winH: number): number {
        return CHART_CONST.TOPBAR_HEIGHT + (chartH - winH);
    }

    private enforceScrollPosition = () => {
        if (!this.isIosDevice || !this.isDataLoaded || !this.container) return;

        // CRITICAL GUARD: Never programmatically scroll if zoomed in.
        // This causes the "slow scroll up" fight.
        if (window.visualViewport && window.visualViewport.scale > 1.01) {
            return;
        }

        const target = this.getScrollTarget(this.container.clientHeight, window.innerHeight);

        // Only scroll if we are "above" the target (showing the spacer)
        if (window.scrollY < target) {
            window.scrollTo({ top: target, behavior: 'auto' }); // 'auto' is cleaner than 'instant' for major jumps sometimes
        }
    };

    private updateDimensions() {
        if (!this.container || !this.chart) return;

        const width = this.viewportService.width;
        const height = this.viewportService.height;

        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;

        this.chart.resize(width, height);

        const isMobile = width <= 768;
        const isLandscape = width > height;
        const isAppMode = this.isIosDevice;

        this.chart.applyOptions({
            timeScale: {
                minimumHeight: getTimeScaleHeight(isAppMode, isLandscape),
                barSpacing: isMobile ? CHART_CONST.MOBILE_BAR_SPACING : CHART_CONST.BAR_SPACING
            }
        });

        // Trigger scroll logic on dimension update
        if (this.isIosDevice && this.isDataLoaded) {
            this.enforceScrollPosition();
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