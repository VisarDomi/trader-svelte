import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { viewport } from '$lib/services/viewport.svelte.js';

// Architecture Components
import { ChartUI } from './ui.svelte.js';
import { ChartPainter } from './painter.svelte.js';
import { ChartLines } from './lines.svelte.js';
import { ChartOverlay } from './overlay.svelte.js';
import { ChartInteraction } from './interaction.svelte.js';
import { ChartDataLoader } from './loader.svelte.js';
import { Watchdog } from '$lib/services/watchdog.svelte.js';

// Stores & Logic (Composition Root)
import { marketStore } from '$lib/stores/market.svelte.js';
import { accountStore } from '$lib/stores/account.svelte.js';
import { positionStore } from '$lib/stores/position.svelte.js';
import { tradeManager } from '$lib/stores/trade.svelte.js';
import { session } from '$lib/services/session.js';
import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
import { isIOS, isPWA } from "$lib/utils/platform.js";
import * as TRADING from '$lib/constants/trading.js';

export class ChartLogic {
    layout = new ChartUI(viewport);
    overlay = new ChartOverlay(accountStore, positionStore, session);
    lines = new ChartLines(marketStore, accountStore);
    painter = new ChartPainter(marketStore);
    interaction = new ChartInteraction(tradeManager, marketStore, positionStore);
    loader = new ChartDataLoader(accountStore, positionStore, marketStore);

    watchdog: Watchdog;

    private chart: IChartApi | null = null;
    private series: ISeriesApi<"Candlestick"> | null = null;
    private currentEpic = "";

    constructor() {
        this.watchdog = new Watchdog(() => this.handleFreeze());

        $effect(() => {
            if (tradeManager.isPlanning) {
                this.lines.update(tradeManager.getMockPosition());
            } else {
                this.lines.update(positionStore.activePosition);
            }
        });
    }

    async init(container: HTMLDivElement) {
        const authorized = await this.loader.ensureSession();
        if (!authorized) return;

        this.currentEpic = session.lastEpic;
        this.watchdog.start();

        this.initChart(container);

        const context = await this.loader.loadContext(this.currentEpic);
        if (!context) return;

        if (this.chart) {
            this.series = this.chart.addSeries(CandlestickSeries, getBaseSeriesOptions(context.precision));

            this.painter.init(this.series);
            this.lines.init(this.series);
            this.interaction.configure(this.series, context.marketDetails, context.userLeverage);
        }

        await this.loader.initStream(
            this.currentEpic,
            positionStore.activePosition?.position.direction
        );

        this.layout.setDataLoaded(true);
        this.overlay.init(this.currentEpic);
    }

    destroy() {
        this.watchdog.stop();
        this.layout.destroy();
        this.painter.destroy();
        this.loader.disconnectStream();
        this.overlay.destroy();

        if (this.chart) {
            this.chart.unsubscribeClick(this.interaction.handleChartClick);
            this.chart.remove();
            this.chart = null;
        }
    }

    private initChart(container: HTMLDivElement) {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Pass derived flags to the pure util function
        const config = {
            width,
            height,
            isPwa: isPWA(),
            isMobile: width <= 768,
            isLandscape: width > height
        };

        this.chart = createChart(container, getChartOptions(config));
        this.chart.subscribeClick(this.interaction.handleChartClick);
        this.layout.init(this.chart, container);
    }

    async confirmTrade() {
        const result = await tradeManager.execute();
        if (result) {
            const source = result.position.direction === TRADING.SELL_DIRECTION
                ? TRADING.CHART_DATA_SOURCE_OFR
                : TRADING.CHART_DATA_SOURCE_BID;
            marketStore.setDataSource(source);
        }
    }

    cancelPlanning() {
        tradeManager.cancel();
        marketStore.setDataSource(TRADING.CHART_DATA_SOURCE_BID);
    }

    private async handleFreeze() {
        console.warn("Freeze detected, reloading stream...");
        await this.loader.reconnectStream(this.currentEpic);
    }
}