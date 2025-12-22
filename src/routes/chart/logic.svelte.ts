import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { viewport } from '$lib/services/viewport.svelte.js';
import * as TRADING from '$lib/constants/trading.js';

// Components / Services
import { ChartUI } from './ui.svelte.js';
import { ChartRenderer } from './ChartRenderer.svelte.js';
import { ChartOverlay } from './overlay.svelte.js';
import { ChartInputHandler, type TradeIntent } from './ChartInputHandler.svelte.js';
import { ChartDataLoader } from './loader.svelte.js';
import { Watchdog } from '$lib/services/watchdog.svelte.js';
import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
import { isPWA } from "$lib/utils/platform.js";

// Types
import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { TradeStore } from '$lib/stores/trade.svelte.js';
import type { SessionManager } from '$lib/services/session.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';

export class ChartLogic {
    layout = new ChartUI(viewport);
    overlay: ChartOverlay;

    private renderer: ChartRenderer;
    private inputHandler: ChartInputHandler;
    private loader: ChartDataLoader;
    private watchdog: Watchdog;

    private chart: IChartApi | null = null;
    private series: ISeriesApi<"Candlestick"> | null = null;

    // State
    private currentEpic = "";
    private userLeverage = 1;
    private marketDetails: MarketDetailsResponse | null = null;

    constructor(
        private marketStore: MarketStore,
        private accountStore: AccountStore,
        private positionStore: PositionStore,
        private tradeStore: TradeStore,
        private session: SessionManager
    ) {
        this.overlay = new ChartOverlay(accountStore, positionStore, session);
        this.loader = new ChartDataLoader(accountStore, positionStore, marketStore);
        this.renderer = new ChartRenderer(marketStore, positionStore, tradeStore, accountStore);
        this.watchdog = new Watchdog(() => this.handleFreeze());

        this.inputHandler = new ChartInputHandler(
            (intent) => this.handleTradeIntent(intent),
            () => this.isInteractionBlocked()
        );
    }

    async init(container: HTMLDivElement) {
        const authorized = await this.loader.ensureSession();
        if (!authorized) return;

        this.currentEpic = this.session.lastEpic;
        this.watchdog.start();

        this.initChart(container);

        const context = await this.loader.loadContext(this.currentEpic);
        if (!context) return;

        // Store Context
        this.userLeverage = context.userLeverage;
        this.marketDetails = context.marketDetails;

        if (this.chart) {
            this.series = this.chart.addSeries(CandlestickSeries, getBaseSeriesOptions(context.precision));
            this.renderer.init(this.series);
            this.inputHandler.configure(this.series, context.marketDetails);
        }

        await this.loader.initStream(
            this.currentEpic,
            this.positionStore.activePosition?.position.direction
        );

        this.layout.setDataLoaded(true);
        this.overlay.init(this.currentEpic);
    }

    destroy() {
        this.watchdog.stop();
        this.layout.destroy();
        this.renderer.destroy();
        this.loader.disconnectStream();
        this.overlay.destroy();

        if (this.chart) {
            this.chart.unsubscribeClick(this.inputHandler.handleChartClick);
            this.chart.remove();
            this.chart = null;
        }
    }

    // --- Actions ---

    async confirmTrade() {
        const result = await this.tradeStore.execute();
        if (result) {
            const source = result.position.direction === TRADING.SELL_DIRECTION
                ? TRADING.CHART_DATA_SOURCE_OFR
                : TRADING.CHART_DATA_SOURCE_BID;
            this.marketStore.setDataSource(source);
        }
    }

    cancelPlanning() {
        this.tradeStore.cancel();
        if (!this.positionStore.activePosition) {
            this.marketStore.setDataSource(TRADING.CHART_DATA_SOURCE_BID);
        }
    }

    // --- Private Interaction Logic ---

    private isInteractionBlocked(): boolean {
        return !!(this.positionStore.activePosition || this.tradeStore.isExecuting);
    }

    private handleTradeIntent(intent: TradeIntent) {
        if (!this.marketDetails) return;

        // 1. Visual Feedback
        this.marketStore.setDataSource(intent.source);

        // 2. Business Logic
        this.tradeStore.plan(
            intent.entryPrice,
            intent.targetPrice,
            intent.direction,
            this.marketDetails,
            this.userLeverage
        );
    }

    private initChart(container: HTMLDivElement) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const config = {
            width,
            height,
            isPwa: isPWA(),
            isMobile: width <= 768,
            isLandscape: width > height
        };

        this.chart = createChart(container, getChartOptions(config));
        this.chart.subscribeClick(this.inputHandler.handleChartClick);
        this.layout.init(this.chart, container);
    }

    private async handleFreeze() {
        console.warn("Freeze detected, reloading stream...");
        await this.loader.reconnectStream(this.currentEpic);
    }
}