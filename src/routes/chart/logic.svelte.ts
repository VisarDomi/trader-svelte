import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { viewport } from '$lib/services/viewport.svelte.js';
import * as TRADING from '$lib/constants/trading.js';

// Components / Services
import { ChartUI } from './ui.svelte.js';
import { ChartRenderer } from './ChartRenderer.svelte.js'; // NEW
import { ChartOverlay } from './overlay.svelte.js';
import { ChartInteraction } from './interaction.svelte.js';
import { ChartDataLoader } from './loader.svelte.js';
import { Watchdog } from '$lib/services/watchdog.svelte.js';
import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
import { isPWA } from "$lib/utils/platform.js";

// Types - Dependency Injection
import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { TradeStore } from '$lib/stores/trade.svelte.js';
import type { SessionManager } from '$lib/services/session.js';

export class ChartLogic {
    // Public Layout State
    layout = new ChartUI(viewport);
    overlay: ChartOverlay;

    // Internal Managers
    private renderer: ChartRenderer;
    private interaction: ChartInteraction;
    private loader: ChartDataLoader;
    private watchdog: Watchdog;

    // Lightweight Charts References
    private chart: IChartApi | null = null;
    private series: ISeriesApi<"Candlestick"> | null = null;

    private currentEpic = "";

    constructor(
        private marketStore: MarketStore,
        private accountStore: AccountStore,
        private positionStore: PositionStore,
        private tradeStore: TradeStore,
        private session: SessionManager
    ) {
        // Initialize Dependencies
        this.overlay = new ChartOverlay(accountStore, positionStore, session);
        this.loader = new ChartDataLoader(accountStore, positionStore, marketStore);
        this.interaction = new ChartInteraction(tradeStore, marketStore, positionStore);
        this.renderer = new ChartRenderer(marketStore, positionStore, tradeStore, accountStore);

        this.watchdog = new Watchdog(() => this.handleFreeze());
    }

    async init(container: HTMLDivElement) {
        // 1. Check Session
        const authorized = await this.loader.ensureSession();
        if (!authorized) return;

        this.currentEpic = this.session.lastEpic;
        this.watchdog.start();

        // 2. Setup Chart DOM
        this.initChart(container);

        // 3. Load Business Data (Context)
        const context = await this.loader.loadContext(this.currentEpic);
        if (!context) return;

        // 4. Configure Series
        if (this.chart) {
            this.series = this.chart.addSeries(CandlestickSeries, getBaseSeriesOptions(context.precision));

            // Wire up Renderer and Interaction
            this.renderer.init(this.series);
            this.interaction.configure(this.series, context.marketDetails, context.userLeverage);
        }

        // 5. Start Data Stream
        await this.loader.initStream(
            this.currentEpic,
            this.positionStore.activePosition?.position.direction
        );

        // 6. Final UI Prep
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
            this.chart.unsubscribeClick(this.interaction.handleChartClick);
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
        // Reset to Bid if we cancelled, unless we have an active Sell position
        // This logic might need refinement based on exact preference,
        // but defaulting to Bid (standard view) or keeping current is safe.
        // For now, let's keep the existing behavior:
        if (!this.positionStore.activePosition) {
            this.marketStore.setDataSource(TRADING.CHART_DATA_SOURCE_BID);
        }
    }

    // --- Private ---

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
        this.chart.subscribeClick(this.interaction.handleChartClick);
        this.layout.init(this.chart, container);
    }

    private async handleFreeze() {
        console.warn("Freeze detected, reloading stream...");
        await this.loader.reconnectStream(this.currentEpic);
    }
}