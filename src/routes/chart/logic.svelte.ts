import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts';
import { goto } from '$app/navigation';
import { viewport } from '$lib/services/viewport.svelte.js';

// Sub-systems
import { ChartUI } from './ui.svelte.js';
import { ChartFeed } from './feed.svelte.js';
import { ChartOverlay } from './overlay.svelte.js';
import { ChartLines } from './lines.svelte.js';
import { Watchdog } from '$lib/services/watchdog.svelte.js';

// Services & Utils
import * as TRADING from '$lib/constants/trading.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { authenticateAndStoreSession, startRestHeartbeat } from "$lib/services/auth.js";
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
    layout = new ChartUI();
    overlay = new ChartOverlay();

    isPlanning = $state(false);
    isExecuting = $state(false);
    plannedTrade = $state<TradeCalculationResult & { direction: Direction, entryPrice: number } | null>(null);

    private feed = new ChartFeed();
    private lines = new ChartLines();
    private watchdog: Watchdog;
    private chart: IChartApi | null = null;
    private series: ISeriesApi<"Candlestick"> | null = null;

    private currentEpic = TRADING.NDX_EPIC;
    private decimalPlaces = 2;
    private activePosition: PositionResponse | null = null;
    private marketDetails: MarketDetailsResponse | null = null;
    private activeAccount: Account | null = null;
    private userLeverage = 1;
    private currentDataSource: ChartData = TRADING.CHART_DATA_SOURCE_BID;

    // Auth heartbeat cleanup function
    private stopAuthHeartbeat: (() => void) | null = null;

    constructor() {
        // Initialize Watchdog with the restart callback
        this.watchdog = new Watchdog(() => this.restartEngine());

        $effect(() => {
            const _w = viewport.width;
            const _h = viewport.height;

            if (this.activeAccount?.symbol) {
                let posToUpdate = this.activePosition;
                if (this.isPlanning && this.plannedTrade && this.marketDetails) {
                    posToUpdate = this.getMockPlanningPosition();
                }

                this.lines.update(posToUpdate, this.activeAccount.symbol);
                this.feed.accountSymbol = this.activeAccount.symbol;
                this.feed.updateLayout();
            }
        });
    }

    async init(container: HTMLDivElement) {
        // 1. Initial Authentication
        try {
            await authenticateAndStoreSession();
            // Start the auth heartbeat (pinging REST API)
            this.stopAuthHeartbeat = startRestHeartbeat();
        } catch {
            await goto('/login');
            return;
        }

        // 2. Start Watchdog & Visibility Listener
        this.watchdog.start();
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }

        this.currentEpic = session.lastEpic;

        // 3. UI Setup
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.chart = createChart(container, getChartOptions(w, h));
        this.chart.subscribeClick(this.handleChartClick);
        this.layout.init(this.chart, container);

        // 4. Load Data
        await this.loadDataAndFeed(true);
        this.layout.setDataLoaded(true);
    }

    destroy() {
        this.watchdog.stop();
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        }
        if (this.stopAuthHeartbeat) {
            this.stopAuthHeartbeat();
            this.stopAuthHeartbeat = null;
        }

        this.layout.destroy();
        this.feed.destroy();
        this.overlay.destroy();
        if (this.chart) {
            this.chart.unsubscribeClick(this.handleChartClick);
            this.chart.remove();
            this.chart = null;
        }
    }

    private handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            // Force an immediate check to catch the gap instantly
            this.watchdog.checkNow();
        }
    };

    /**
     * TEARDOWN & RESTART
     * Called when Watchdog detects a significant time gap.
     */
    private async restartEngine() {
        console.log('[Engine] Freeze detected. Restarting...');

        // 1. Teardown
        // Kill the feed (WebSocket) immediately to prevent zombie behavior
        this.feed.destroy();

        // Stop the auth heartbeat to prevent stacked intervals
        if (this.stopAuthHeartbeat) {
            this.stopAuthHeartbeat();
            this.stopAuthHeartbeat = null;
        }

        // 2. Re-Auth (Refresh tokens if expired)
        try {
            await authenticateAndStoreSession();
            // Restart auth heartbeat
            this.stopAuthHeartbeat = startRestHeartbeat();
        } catch (e) {
            console.error("[Engine] Session invalid on resume", e);
            // If we can't auth, we must go to login
            await goto('/login');
            return;
        }

        // 3. Hydration (Data + WS)
        // Pass false to reuse existing chart series
        await this.loadDataAndFeed(false);

        console.log('[Engine] Restart complete.');
    }

    private async loadDataAndFeed(createSeries: boolean) {
        const mode = session.mode;
        let tokens = session.getTokens(mode);
        let client = session.getClient(mode);

        if (!client || !tokens) {
            await goto('/login');
            return;
        }

        try {
            const accounts = await getSyncedAccounts(mode, tokens, client);
            this.activeAccount = accounts.find(a => a.preferred) || accounts[0];

            // Refresh client with potentially new tokens
            client = session.getClient(mode)!;
            tokens = session.getTokens(mode)!;

            const [md, positionsResp, prefs] = await Promise.all([
                getMarketDetails(client, this.currentEpic),
                getPositions(client),
                getPreferences(client)
            ]);

            this.marketDetails = md;
            this.decimalPlaces = md.snapshot.decimalPlacesFactor;

            const category = md.instrument.type as LeverageCategory;
            if (prefs.leverages[category]) {
                this.userLeverage = prefs.leverages[category].current;
            } else if (md.instrument.marginFactorUnit === 'PERCENTAGE' && md.instrument.marginFactor > 0) {
                this.userLeverage = 100 / md.instrument.marginFactor;
            }

            const foundPos = positionsResp.positions.find(p => p.market.epic === this.currentEpic);
            if (foundPos && this.activeAccount) {
                foundPos.position.initialBalance = resolveInitialBalance(foundPos.position, this.activeAccount);
                this.activePosition = foundPos;

                if (this.activePosition.position.direction === TRADING.SELL_DIRECTION) {
                    this.currentDataSource = TRADING.CHART_DATA_SOURCE_OFR;
                } else {
                    this.currentDataSource = TRADING.CHART_DATA_SOURCE_BID;
                }
            } else {
                this.activePosition = null;
                // Keep current data source on restart if no position, or reset to BID?
                // Keeping it as is handles the case where user was viewing OFR manually.
                // But generally safe to default to BID if no position.
                // Let's stick to BID if no position to ensure clean state.
                this.currentDataSource = TRADING.CHART_DATA_SOURCE_BID;
            }

            if (createSeries && this.chart) {
                const pricePrecision = Math.pow(10, this.decimalPlaces);
                this.series = this.chart.addSeries(CandlestickSeries, getBaseSeriesOptions(pricePrecision));
                this.lines.init(this.series);
            }

            await this.overlay.init(this.currentEpic, (acc) => this.handlePositionClosed(acc));

            if (this.activeAccount) {
                this.lines.update(this.activePosition, this.activeAccount.symbol);
                this.feed.accountSymbol = this.activeAccount.symbol;
            } else {
                this.lines.update(this.activePosition, "");
            }

            if (this.series) {
                await this.feed.initDynamic(
                    tokens,
                    this.currentEpic,
                    this.series,
                    this.currentDataSource,
                    this.decimalPlaces,
                    this.activePosition
                );
            }

        } catch (e) {
            console.error("Chart Logic Load Failed", e);
            notifications.error("Connection failed. Retrying...");
        }
    }

    async handlePositionClosed(account: Account | null) {
        this.activePosition = null;
        this.feed.position = null;
        this.lines.update(null, account?.symbol || "");
        this.currentDataSource = TRADING.CHART_DATA_SOURCE_BID;
        await this.feed.setDataSource(TRADING.CHART_DATA_SOURCE_BID);

        if (account) {
            this.activeAccount = account;
            this.feed.accountSymbol = account.symbol;
        } else {
            await this.refreshAccountData();
        }
    }

    private async refreshAccountData() {
        const client = session.getClient(session.mode);
        if (client) {
            const accounts = await getSyncedAccounts(session.mode, session.getTokens(session.mode)!, client);
            this.activeAccount = accounts.find(a => a.preferred) || accounts[0];
            if (this.activeAccount) {
                this.feed.accountSymbol = this.activeAccount.symbol;
            }
        }
    }

    private handleChartClick = async (param: MouseEventParams) => {
        if (this.activePosition) return;
        if (this.isExecuting) return;

        if (!param.point || !this.series || !this.feed.currentBid || !this.feed.currentOfr) return;
        if (!this.marketDetails || !this.activeAccount) return;

        const clickPrice = this.series.coordinateToPrice(param.point.y);
        if (clickPrice === null) return;

        const snapshotBid = this.feed.currentBid;
        const snapshotOfr = this.feed.currentOfr;

        let direction: Direction;
        let targetSource: ChartData;
        let executionPrice: number;

        if (clickPrice > snapshotOfr) {
            direction = TRADING.BUY_DIRECTION;
            targetSource = TRADING.CHART_DATA_SOURCE_BID;
            executionPrice = snapshotOfr;
        } else if (clickPrice < snapshotBid) {
            direction = TRADING.SELL_DIRECTION;
            targetSource = TRADING.CHART_DATA_SOURCE_OFR;
            executionPrice = snapshotBid;
        } else {
            return;
        }

        this.currentDataSource = targetSource;
        await this.feed.setDataSource(targetSource);

        const basisBalance = this.activeAccount.balance.deposit;

        const result = calculatePositionParameters({
            accountBalance: basisBalance,
            leverage: this.userLeverage,
            entryPrice: executionPrice,
            lotSize: this.marketDetails.instrument.lotSize || 1,
            minSizeIncrement: this.marketDetails.dealingRules.minSizeIncrement.value,
            minDealSize: this.marketDetails.dealingRules.minDealSize.value,
            decimalPlaces: this.decimalPlaces,
            direction,
            clickPrice,
            stopLossRatio: TRADING.STOP_LOSS_RATIO
        });

        if (result) {
            this.isPlanning = true;
            this.plannedTrade = {
                ...result,
                direction,
                entryPrice: executionPrice
            };
            this.drawPlannedLines();
        } else {
            const maxPosSize = (basisBalance * this.userLeverage) / (executionPrice * (this.marketDetails.instrument.lotSize || 1));
            const minSize = this.marketDetails.dealingRules.minDealSize.value;
            notifications.error(`Plan Failed. Deposit: ${basisBalance.toFixed(2)}, MaxSize: ${maxPosSize.toFixed(2)}, MinReq: ${minSize}`);
        }
    };

    private getMockPlanningPosition(): PositionResponse | null {
        if (!this.plannedTrade || !this.marketDetails || !this.activeAccount) return null;

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

        return {
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
    }

    private drawPlannedLines() {
        const mock = this.getMockPlanningPosition();
        if (mock && this.activeAccount) {
            this.lines.update(mock, this.activeAccount.symbol);
        }
    }

    cancelPlanning() {
        this.isPlanning = false;
        this.plannedTrade = null;
        this.lines.clear();
        this.currentDataSource = TRADING.CHART_DATA_SOURCE_BID;
        this.feed.setDataSource(TRADING.CHART_DATA_SOURCE_BID);
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

            const positionsResp = await getPositions(client);
            const foundPos = positionsResp.positions.find(p => p.market.epic === this.currentEpic);

            this.isPlanning = false;
            this.plannedTrade = null;

            if (foundPos) {
                foundPos.position.initialBalance = this.activeAccount.balance.deposit;
                this.activePosition = foundPos;

                this.lines.update(this.activePosition, this.activeAccount.symbol);
                this.feed.position = this.activePosition;
                this.feed.accountSymbol = this.activeAccount.symbol;
                this.overlay.position = this.activePosition;

                if (foundPos.position.direction === TRADING.SELL_DIRECTION) {
                    this.currentDataSource = TRADING.CHART_DATA_SOURCE_OFR;
                    await this.feed.setDataSource(TRADING.CHART_DATA_SOURCE_OFR);
                } else {
                    this.currentDataSource = TRADING.CHART_DATA_SOURCE_BID;
                    await this.feed.setDataSource(TRADING.CHART_DATA_SOURCE_BID);
                }

                this.refreshAccountData();
            } else {
                this.lines.clear();
            }

            notifications.success("Position Opened");

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
        } finally {
            this.isExecuting = false;
        }
    }
}