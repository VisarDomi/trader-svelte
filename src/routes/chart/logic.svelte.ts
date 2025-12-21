import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts';
import { goto } from '$app/navigation';

// Sub-systems
import { ChartUI } from './ui.svelte.js';
import { ChartFeed } from './feed.svelte.js';
import { ChartOverlay } from './overlay.svelte.js';
import { ChartLines } from './lines.svelte.js';

// Services & Utils
import * as TRADING from '$lib/constants/trading.js';
import * as AUTH from '$lib/constants/auth.js';
import { session } from '$lib/services/session.js';
import { authenticateAndStoreSession } from "$lib/services/auth.js";
import { getMarketDetails } from "$lib/services/market.js";
import { getPositions } from "$lib/services/trading.js";
import { getSyncedAccounts } from "$lib/services/account.js";
import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
import { resolveInitialBalance } from "$lib/utils/position.js";
import type { ChartData, PositionResponse } from '$lib/types/trading.js';

export class ChartLogic {
    // State exposed to View
    layout = new ChartUI();
    overlay = new ChartOverlay();

    // Internal State
    private feed = new ChartFeed();
    private lines = new ChartLines();
    private chart: IChartApi | null = null;
    private series: ISeriesApi<"Candlestick"> | null = null;

    private currentEpic = TRADING.NDX_EPIC;
    private decimalPlaces = 2;
    private activePosition: PositionResponse | null = null;

    async init(container: HTMLDivElement) {
        // 1. Auth Check
        try {
            await authenticateAndStoreSession();
        } catch {
            await goto('/login');
            return;
        }

        // 2. Context Setup
        this.currentEpic = session.lastEpic;
        const mode = session.mode; // 'REAL' or 'DEMO' logic for Trading
        const client = session.getClient(mode);

        // For Charts, we typically prefer REAL data if available, but let's stick to the active mode
        // to ensure token validity.
        if (!client) {
            await goto('/login');
            return;
        }

        // 3. Data Fetching
        let pricePrecision = 100;
        let chartDataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID;
        const tokens = session.getTokens(mode)!; // Safe because client exists

        try {
            const [marketDetails, positionsResp, accounts] = await Promise.all([
                getMarketDetails(client, this.currentEpic),
                getPositions(client),
                getSyncedAccounts(mode, tokens, client)
            ]);

            this.decimalPlaces = marketDetails.snapshot.decimalPlacesFactor;
            pricePrecision = Math.pow(10, this.decimalPlaces);

            // Resolve Position
            const activeAccount = accounts.find(a => a.preferred) || accounts[0];
            const foundPos = positionsResp.positions.find(p => p.market.epic === this.currentEpic);

            if (foundPos && activeAccount) {
                foundPos.position.initialBalance = resolveInitialBalance(foundPos.position, activeAccount);
                this.activePosition = foundPos;

                // If SHORT, show OFFER price graph
                if (this.activePosition.position.direction === TRADING.SELL_DIRECTION) {
                    chartDataSource = TRADING.CHART_DATA_SOURCE_OFR;
                }
            } else {
                this.activePosition = null;
                chartDataSource = TRADING.CHART_DATA_SOURCE_BID;
            }

        } catch (e) {
            console.error("Chart Logic Init Failed", e);
        }

        // 4. Initialize Sub-systems
        await this.overlay.init(this.currentEpic);

        // 5. Chart Instantiation
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.chart = createChart(container, getChartOptions(w, h));
        this.chart.subscribeClick(this.handleChartClick);

        this.series = this.chart.addSeries(CandlestickSeries, getBaseSeriesOptions(pricePrecision));

        this.layout.init(this.chart, container);
        this.lines.init(this.series);
        this.lines.update(this.activePosition);

        // 6. Start Feed
        await this.feed.init(
            tokens,
            this.currentEpic,
            this.series,
            chartDataSource,
            this.decimalPlaces,
            this.activePosition
        );

        this.layout.setDataLoaded(true);
    }

    destroy() {
        this.layout.destroy();
        this.feed.destroy();
        this.overlay.destroy();
        if (this.chart) {
            this.chart.unsubscribeClick(this.handleChartClick);
            this.chart.remove();
            this.chart = null;
        }
    }

    private handleChartClick = (param: MouseEventParams) => {
        if (this.activePosition) {
            goto('/position');
            return;
        }

        if (!param.point || !this.series || !this.feed.currentBid || !this.feed.currentOfr) return;

        const clickPrice = this.series.coordinateToPrice(param.point.y);
        if (clickPrice === null) return;

        let direction: string | null = null;

        if (clickPrice > this.feed.currentOfr) {
            direction = TRADING.BUY_DIRECTION;
        } else if (clickPrice < this.feed.currentBid) {
            direction = TRADING.SELL_DIRECTION;
        }

        if (direction) {
            const params = new URLSearchParams({
                epic: this.currentEpic,
                direction: direction,
                price: clickPrice.toFixed(this.decimalPlaces),
                bid: this.feed.currentBid.toFixed(this.decimalPlaces),
                ofr: this.feed.currentOfr.toFixed(this.decimalPlaces)
            });
            goto(`/trade?${params.toString()}`);
        }
    };
}