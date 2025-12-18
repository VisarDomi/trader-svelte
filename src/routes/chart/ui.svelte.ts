import type { IChartApi } from "lightweight-charts";
import { isIOS } from "$lib/utils/platform.js";
import { getStoredDimensions, removeTradingViewLogo } from "$lib/utils/helpers.js";
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
        this.attachListeners();
        this.updateDimensions();
        removeTradingViewLogo();
    }

    setDataLoaded(loaded: boolean) {
        this.isDataLoaded = loaded;
        if (loaded) {
            setTimeout(() => this.updateDimensions(), 0);
        }
    }

    private attachListeners() {
        if (typeof window === 'undefined') return;
        window.addEventListener(EVENTS.WINDOW_RESIZE, this.handleResize);
        window.addEventListener(EVENTS.WINDOW_ORIENTATION_CHANGE, this.handleResize);
        if (this.isIosDevice) {
            window.addEventListener('scroll', this.handleScroll);
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
        if (window.scrollY < target) {
            window.scrollTo({
                top: target,
                behavior: 'instant'
            });
        }
    };

    private updateDimensions() {
        if (!this.container || !this.chart) return;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        let width: number;
        let height: number;
        if (this.isIosDevice && this.isDataLoaded) {
            const dims = getStoredDimensions();
            width = dims.width;
            height = dims.height;
        } else {
            width = windowWidth;
            height = windowHeight;
        }
        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;
        this.chart.resize(width, height);
        const isMobile = windowWidth <= 768;
        this.chart.applyOptions({
            timeScale: {
                minimumHeight: getTimeScaleHeight(),
                barSpacing: isMobile ? CHART_CONST.MOBILE_BAR_SPACING : CHART_CONST.BAR_SPACING
            }
        });
        if (this.isIosDevice && this.isDataLoaded) {
            const scrollTarget = this.getScrollTarget(height, windowHeight);
            window.scrollTo({
                top: scrollTarget,
                behavior: 'instant'
            });
        }
    }
}