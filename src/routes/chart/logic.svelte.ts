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
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { authenticateAndStoreSession } from "$lib/services/auth.js";
import { getMarketDetails } from "$lib/services/market.js";
import { getPositions, createPosition, getConfirmation } from "$lib/services/trading.js";
import { getSyncedAccounts, getPreferences } from "$lib/services/account.js";
import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
import { resolveInitialBalance } from "$lib/utils/position.js";
import { calculatePositionParameters, type TradeCalculationResult } from "$lib/utils/trading.js";
import type { ChartData, PositionResponse, Direction, TradeRequest, PositionBody } from '$lib/types/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { Account, LeverageCategory } from '$lib/types/account.js';

export class ChartLogic {
    // State exposed to View
    layout = new ChartUI();
    overlay = new ChartOverlay();

    // Planning State
    isPlanning = $state(false);
    isExecuting = $state(false);
    plannedTrade = $state<TradeCalculationResult & { direction: Direction, entryPrice: number } | null>(null);

    // Internal State
    private feed = new ChartFeed();
    private lines = new ChartLines();
    private chart: IChartApi | null = null;
    private series: ISeriesApi<"Candlestick"> | null = null;

    private currentEpic = TRADING.NDX_EPIC;
    private decimalPlaces = 2;
    private activePosition: PositionResponse | null = null;

    // Cache for Calculation
    private marketDetails: MarketDetailsResponse | null = null;
    private activeAccount: Account | null = null;
    private userLeverage = 1;

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
        const mode = session.mode;
        const client = session.getClient(mode);

        if (!client) {
            await goto('/login');
            return;
        }

        // 3. Data Fetching
        let pricePrecision = 100;
        let chartDataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID;
        const tokens = session.getTokens(mode)!;

        try {
            const [md, positionsResp, accounts, prefs] = await Promise.all([
                getMarketDetails(client, this.currentEpic),
                getPositions(client),
                getSyncedAccounts(mode, tokens, client),
                getPreferences(client)
            ]);

            this.marketDetails = md;
            this.activeAccount = accounts.find(a => a.preferred) || accounts[0];
            this.decimalPlaces = md.snapshot.decimalPlacesFactor;
            pricePrecision = Math.pow(10, this.decimalPlaces);

            // Determine Leverage for Planning
            const category = md.instrument.type as LeverageCategory;
            if (prefs.leverages[category]) {
                this.userLeverage = prefs.leverages[category].current;
            } else if (md.instrument.marginFactorUnit === 'PERCENTAGE' && md.instrument.marginFactor > 0) {
                this.userLeverage = 100 / md.instrument.marginFactor;
            }

            // Resolve Position
            const foundPos = positionsResp.positions.find(p => p.market.epic === this.currentEpic);

            if (foundPos && this.activeAccount) {
                foundPos.position.initialBalance = resolveInitialBalance(foundPos.position, this.activeAccount);
                this.activePosition = foundPos;

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
        await this.overlay.init(this.currentEpic, () => this.refresh());

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

    async refresh() {
        location.reload();
    }

    private handleChartClick = (param: MouseEventParams) => {
        // If we have an active position, clicks do nothing
        if (this.activePosition) return;

        // If we are executing a trade, ignore clicks
        if (this.isExecuting) return;

        if (!param.point || !this.series || !this.feed.currentBid || !this.feed.currentOfr) return;
        if (!this.marketDetails || !this.activeAccount) return;

        const clickPrice = this.series.coordinateToPrice(param.point.y);
        if (clickPrice === null) return;

        // Determine Direction
        let direction: Direction;
        let entryPrice: number;

        if (clickPrice > this.feed.currentOfr) {
            direction = TRADING.BUY_DIRECTION;
            entryPrice = this.feed.currentOfr;
        } else {
            direction = TRADING.SELL_DIRECTION;
            entryPrice = this.feed.currentBid;
        }

        const result = calculatePositionParameters({
            accountBalance: this.activeAccount.balance.available,
            leverage: this.userLeverage,
            entryPrice,
            lotSize: this.marketDetails.instrument.lotSize || 1,
            minSizeIncrement: this.marketDetails.dealingRules.minSizeIncrement.value,
            minDealSize: this.marketDetails.dealingRules.minDealSize.value,
            decimalPlaces: this.decimalPlaces,
            direction,
            clickPrice, // Take Profit
            stopLossRatio: TRADING.STOP_LOSS_RATIO
        });

        if (result) {
            this.isPlanning = true;
            this.plannedTrade = {
                ...result,
                direction,
                entryPrice
            };
            this.drawPlannedLines();
        } else {
            notifications.error("Cannot plan trade: Insufficient funds or invalid params");
        }
    };

    private drawPlannedLines() {
        if (!this.plannedTrade || !this.marketDetails || !this.activeAccount) return;

        const mockBody: PositionBody = {
            contractSize: 0,
            createdDate: new Date().toISOString(),
            createdDateUTC: new Date().toISOString(),
            dealId: "planning",
            dealReference: "planning",
            size: this.plannedTrade.size,
            leverage: this.userLeverage,
            upl: 0,
            direction: this.plannedTrade.direction,
            level: this.plannedTrade.entryPrice,
            currency: this.marketDetails.instrument.currency,
            guaranteedStop: false,
            stopLevel: this.plannedTrade.stopLevel,
            profitLevel: this.plannedTrade.profitLevel,
            initialBalance: this.activeAccount.balance.deposit
        };

        const mockResponse: PositionResponse = {
            market: {
                ...this.marketDetails.snapshot,
                epic: this.currentEpic,
                instrumentName: this.marketDetails.instrument.name,
                symbol: this.marketDetails.instrument.symbol,
                expiry: '-',
                instrumentType: this.marketDetails.instrument.type,
                lotSize: this.marketDetails.instrument.lotSize,
                streamingPricesAvailable: true
            } as any,
            position: mockBody
        };

        this.lines.update(mockResponse);
    }

    cancelPlanning() {
        this.isPlanning = false;
        this.plannedTrade = null;
        this.lines.clear();
    }

    async confirmTrade() {
        if (!this.plannedTrade || !this.activeAccount) return;

        this.isExecuting = true;
        const client = session.getClient(session.mode);

        if (!client) {
            notifications.error("Session Error");
            this.isExecuting = false;
            return;
        }

        try {
            const body: TradeRequest = {
                epic: this.currentEpic,
                direction: this.plannedTrade.direction,
                size: this.plannedTrade.size,
                stopLevel: this.plannedTrade.stopLevel,
                profitLevel: this.plannedTrade.profitLevel
            };

            const response = await createPosition(client, body);
            const confirmation = await getConfirmation(client, response.dealReference);

            session.setInitialBalance(confirmation.dealId, this.activeAccount.balance.deposit);

            notifications.success("Position Opened");
            location.reload();

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
            this.isExecuting = false;
        }
    }
}