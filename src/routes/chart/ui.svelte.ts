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

        // Centralized resize logic using Svelte 5 effects.
        $effect(() => {
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
            // Only apply scroll hack in iOS PWA mode
            if (this.isIosDevice && this.isPwa) {
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
        window.removeEventListener('scroll', this.handleScroll);
    }

    private getScrollTarget(chartH: number, winH: number): number {
        return CHART_CONST.TOPBAR_HEIGHT + (chartH - winH);
    }

    private handleScroll = () => {
        // Explicitly check for PWA here too
        if (!this.isIosDevice || !this.isPwa || !this.isDataLoaded || !this.container) return;
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

        // Use PWA specific logic only if strictly in iOS PWA mode
        if (this.isIosDevice && this.isPwa && this.isDataLoaded) {
            const dims = viewport.getChartDimensions();
            width = dims.width;
            height = dims.height;
        } else {
            // Standard behavior for Desktop / Android / Non-PWA
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