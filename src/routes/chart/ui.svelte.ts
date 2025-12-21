import type { IChartApi } from "lightweight-charts";
import { isIOS } from "$lib/utils/platform.js";
import { viewport } from "$lib/services/viewport.svelte.js";
import { getTimeScaleHeight } from "$lib/utils/chart.js";
import * as EVENTS from '$lib/constants/events.js';
import * as CHART_CONST from '$lib/constants/chart.js';

export class ChartUI {
    isIosDevice = $state(false);
    isDataLoaded = $state(false);
    private chart: IChartApi | null = null;
    private container: HTMLDivElement | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            this.isIosDevice = isIOS();
        }
    }

    init(chart: IChartApi, container: HTMLDivElement) {
        this.chart = chart;
        this.container = container;

        // Listeners for Resize are now handled centrally by ViewportService,
        // but we need to react to its changes.
        // However, standard "resize" events are still useful for triggering the chart update.
        if (typeof window !== 'undefined') {
            window.addEventListener(EVENTS.WINDOW_RESIZE, this.handleResize);
            window.addEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, this.handleResize);
            if (this.isIosDevice) {
                window.addEventListener('scroll', this.handleScroll);
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
        window.removeEventListener(EVENTS.WINDOW_RESIZE, this.handleResize);
        window.removeEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, this.handleResize);
        window.removeEventListener('scroll', this.handleScroll);
    }

    private getScrollTarget(chartH: number, winH: number): number {
        return CHART_CONST.TOPBAR_HEIGHT + (chartH - winH);
    }

    private handleResize = () => {
        this.updateDimensions();
    };

    private handleScroll = () => {
        if (!this.isIosDevice || !this.isDataLoaded || !this.container) return;
        const chartH = this.container.clientHeight;
        const winH = window.innerHeight;
        const target = this.getScrollTarget(chartH, winH);

        // Prevent scrolling "above" the chart (showing address bar) if we are locked in
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

        if (this.isIosDevice && this.isDataLoaded) {
            const dims = viewport.getChartDimensions();
            width = dims.width;
            height = dims.height;
        } else {
            // Standard behavior for Desktop / Android
            width = viewport.width; // Reactive from service
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

        if (this.isIosDevice && this.isDataLoaded) {
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