import { isIOS } from "$lib/utils/platform";
import { getStoredDimensions, removeTradingViewLogo } from "$lib/utils/helpers";
import { getTimeScaleHeight } from "$lib/utils/chart";
import * as EVENTS from '$lib/constants/events.js';
import * as CHART_CONST from '$lib/constants/chart.js';
import type { IChartApi } from "lightweight-charts";

export class ChartUI {
    // State
    isIosDevice = $state(false);
    isDataLoaded = $state(false);

    // Private refs
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

        // One-off UI cleanups
        removeTradingViewLogo();
    }

    setDataLoaded(loaded: boolean) {
        this.isDataLoaded = loaded;
        // Trigger a final resize/scroll once data is ready
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

    // --- Logic ---

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

        // 1. Update Container
        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;

        // 2. Update Chart Internal Size
        this.chart.resize(width, height);

        // 3. Update TimeScale (Mobile spacing)
        const isMobile = windowWidth <= 768;
        this.chart.applyOptions({
            timeScale: {
                minimumHeight: getTimeScaleHeight(),
                barSpacing: isMobile ? CHART_CONST.MOBILE_BAR_SPACING : CHART_CONST.BAR_SPACING
            }
        });

        // 4. Handle iOS Scroll Hack
        if (this.isIosDevice && this.isDataLoaded) {
            const scrollTarget = this.getScrollTarget(height, windowHeight);
            window.scrollTo({
                top: scrollTarget,
                behavior: 'instant'
            });
        }
    }
}