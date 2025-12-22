import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { goto } from '$app/navigation';
import { viewport } from '$lib/services/viewport.svelte.js';

// Architecture Components
import { ChartUI } from './ui.svelte.js';
import { ChartPainter } from './painter.svelte.js';
import { ChartLines } from './lines.svelte.js';
import { ChartOverlay } from './overlay.svelte.js';
import { ChartInteraction } from './interaction.svelte.js';
import { Watchdog } from '$lib/services/watchdog.svelte.js';

// Stores & Logic
import { marketStore } from '$lib/stores/market.svelte.js';
import { accountStore } from '$lib/stores/account.svelte.js';
import { positionStore } from '$lib/stores/position.svelte.js';
import { tradeManager } from '$lib/stores/trade.svelte.js';
import { authenticateAndStoreSession } from "$lib/services/auth.js";
import { getMarketDetails } from "$lib/services/market.js";
import { getPreferences } from "$lib/services/account.js";
import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
import { session } from '$lib/services/session.js';
import { api } from '$lib/services/api.svelte.js';

import * as TRADING from '$lib/constants/trading.js';
import type { LeverageCategory } from '$lib/types/account.js';
import type { ChartData } from "$lib/types/trading";

export class ChartLogic {
    // UI Helpers
    layout = new ChartUI();
    overlay = new ChartOverlay();
    lines = new ChartLines();

    // Core Logic
    painter = new ChartPainter(marketStore);
    interaction = new ChartInteraction(tradeManager, marketStore, positionStore);
    watchdog: Watchdog;

    // Local Config
    private chart: IChartApi | null = null;
    private series: ISeriesApi<"Candlestick"> | null = null;
    private currentEpic = "";

    constructor() {
        this.watchdog = new Watchdog(() => this.handleFreeze());

        // Master Effect: Update Lines whenever relevant state changes
        $effect(() => {
            // Register dependencies
            const _tick = marketStore.lastCandle;
            const _vp = viewport.width;

            if (tradeManager.isPlanning) {
                // Draw Ghost Lines
                this.lines.update(tradeManager.getMockPosition());
            } else {
                // Draw Real Position Lines
                this.lines.update(positionStore.activePosition);
            }
        });
    }

    async init(container: HTMLDivElement) {
        // Ensure valid session before starting heavy data
        try {
            await authenticateAndStoreSession();
        } catch {
            await goto('/login');
            return;
        }

        this.currentEpic = session.lastEpic;
        this.watchdog.start();

        // 1. Initialize Chart UI
        this.initChart(container);

        // 2. Load Core Data (Parallel)
        await Promise.all([
            accountStore.init(),
            positionStore.init(this.currentEpic),
            this.loadMarketConfig()
        ]);

        // 3. Initialize Feed
        // We set data source based on current position direction
        let source: ChartData = TRADING.CHART_DATA_SOURCE_BID;
        if (positionStore.activePosition?.position.direction === TRADING.SELL_DIRECTION) {
            source = TRADING.CHART_DATA_SOURCE_OFR;
        }

        await marketStore.init(this.currentEpic, source);
        this.layout.setDataLoaded(true);

        // 4. Initialize Overlay
        this.overlay.init(this.currentEpic);
    }

    destroy() {
        this.watchdog.stop();

        this.layout.destroy();
        this.painter.destroy();
        marketStore.disconnect();
        this.overlay.destroy();

        if (this.chart) {
            // Unsubscribe using the interaction handler
            this.chart.unsubscribeClick(this.interaction.handleChartClick);
            this.chart.remove();
            this.chart = null;
        }
    }

    private initChart(container: HTMLDivElement) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.chart = createChart(container, getChartOptions(w, h));

        // Delegate clicks to Interaction Handler
        this.chart.subscribeClick(this.interaction.handleChartClick);

        this.layout.init(this.chart, container);
    }

    private async loadMarketConfig() {
        const client = api.client;
        if (!client) return;

        try {
            const [md, prefs] = await Promise.all([
                getMarketDetails(client, this.currentEpic),
                getPreferences(client)
            ]);

            // Determine Leverage
            let userLeverage = 1;
            const category = md.instrument.type as LeverageCategory;
            if (prefs.leverages[category]) {
                userLeverage = prefs.leverages[category].current;
            } else if (md.instrument.marginFactorUnit === 'PERCENTAGE') {
                userLeverage = 100 / md.instrument.marginFactor;
            }

            // Create Series with correct precision
            const precision = Math.pow(10, md.snapshot.decimalPlacesFactor);
            if (this.chart) {
                this.series = this.chart.addSeries(CandlestickSeries, getBaseSeriesOptions(precision));
                this.painter.init(this.series);
                this.lines.init(this.series);

                // Configure Interaction Handler
                this.interaction.configure(this.series, md, userLeverage);
            }
        } catch (e) {
            console.error("Config Load Failed", e);
        }
    }

    // Proxy methods for UI access (kept for backward compatibility with View)
    async confirmTrade() {
        const result = await tradeManager.execute();
        if (result) {
            // Update Stores
            positionStore.set(result);
            accountStore.updateBalance(result.position.initialBalance || 0);

            // Adjust Data Source based on resulted trade
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
        console.warn("Freeze detected, reloading...");
        marketStore.disconnect();
        try {
            await authenticateAndStoreSession();
            await marketStore.init(this.currentEpic, marketStore.dataSource);
        } catch {
            await goto('/login');
        }
    }
}