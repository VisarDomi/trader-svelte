import { viewport } from '$lib/services/viewport.svelte.js';
import * as TRADING from '$lib/constants/trading.js';
import * as STORAGE from '$lib/constants/storage.js';

import { ChartController, type ViewState } from './ChartController.js';
import { ChartUI } from './ChartUI.svelte.js';
import { ChartRenderer } from './ChartRenderer.svelte.js';
import { ChartOverlay } from './ChartOverlay.svelte.js';
import { ChartInputHandler, type ChartClickEvent } from './ChartInputHandler.svelte.js'; // Updated Import
import { ChartDataLoader } from './ChartLoader.svelte.js';
import { Watchdog } from '$lib/services/watchdog.svelte.js';
import { RiskManager } from '$lib/domain/trade/RiskManager.js';
import { TradingDomain } from '$lib/domain/trade/TradingDomain.js'; // New Import

import { ChartContext } from '$lib/features/chart/ChartContext.svelte.js';

import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { TradeStore } from '$lib/stores/trade.svelte.js';
import type { SessionManager } from '$lib/services/session.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';

export class ChartLogic {
    layout = new ChartUI(viewport);
    overlay: ChartOverlay;
    controller = new ChartController();

    context = new ChartContext();

    private renderer: ChartRenderer;
    private inputHandler: ChartInputHandler;
    private loader: ChartDataLoader;
    private watchdog: Watchdog;
    private riskManager = new RiskManager();
    private tradingDomain = new TradingDomain(); // New Domain Service

    private currentEpic = "";
    private userLeverage = 1;

    private marketDetails = $state<MarketDetailsResponse | null>(null);

    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private isBurstChecking = false;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private lastSyncMinute = -1;
    private preResizeState: ViewState | null = null;

    constructor(
        private marketStore: MarketStore,
        private accountStore: AccountStore,
        private positionStore: PositionStore,
        private tradeStore: TradeStore,
        private session: SessionManager
    ) {
        this.overlay = new ChartOverlay(accountStore, positionStore, session, this);
        this.loader = new ChartDataLoader(accountStore, positionStore, marketStore);
        this.renderer = new ChartRenderer(marketStore, positionStore, tradeStore, accountStore);
        this.watchdog = new Watchdog(() => this.handleFreeze());

        // Updated Handler Instantiation
        this.inputHandler = new ChartInputHandler(
            (event) => this.handleChartClick(event),
            () => this.isInteractionBlocked()
        );

        $effect(() => {
            const price = this.marketStore.currentPrice;
            if (price > 0 && this.positionStore.activePosition) {
                this.checkLimits(price);
            }
        });

        $effect(() => {
            this.context.marketDetails = this.marketDetails;
            this.context.currentPrice = this.marketStore.currentPrice;
            this.context.lastCandle = this.marketStore.lastCandle;

            if (this.tradeStore.isPlanning) {
                this.context.activePosition = this.tradeStore.getMockPosition();
                this.context.isPlanningTrade = true;
            } else {
                this.context.activePosition = this.positionStore.activePosition;
                this.context.isPlanningTrade = false;
            }

            this.context.accountBalance = this.accountStore.balance;
            this.context.activeSymbol = this.accountStore.activeSymbol;
            this.context.viewportWidth = this.layout.isDataLoaded ? viewport.width : 0;
            this.context.viewportHeight = this.layout.isDataLoaded ? viewport.height : 0;
        });
    }

    // ... (Init, Destroy, Zoom, Trade Confirmation, Limits, Heartbeat methods remain unchanged)
    // ... Copy them exactly from the previous file to ensure no regression.
    // ... For brevity in this diff, I am only showing the changed handler method below.

    async init(container: HTMLDivElement) {
        const authorized = await this.loader.ensureSession();
        if (!authorized) return;

        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this.saveZoom);
        }

        this.currentEpic = this.session.lastEpic;
        this.watchdog.start();
        this.startHeartbeat();

        this.controller.init(container);

        this.layout.init(this.controller.chart, container, {
            onBeforeResize: () => {
                this.preResizeState = this.controller.getViewState();
            },
            onAfterResize: () => {
                if (this.preResizeState) {
                    this.controller.restoreViewState(this.preResizeState);
                    this.preResizeState = null;
                }
            }
        });

        const context = await this.loader.loadContext(this.currentEpic);
        if (!context) return;

        this.userLeverage = context.userLeverage;
        this.marketDetails = context.marketDetails;
        this.context.marketDetails = this.marketDetails;

        this.controller.createMainSeries(context.precision);

        if (this.marketDetails.instrument.overnightFee?.swapChargeTimestamp) {
            const currentPrice = this.marketDetails.snapshot.bid;
            if (currentPrice > 0) {
                this.controller.extendTimeScale24H(currentPrice);
            }
        }

        this.renderer.init(this.controller.chart, this.controller.series, this.context);

        this.inputHandler.configure(this.controller.series);
        this.controller.subscribeClick(this.inputHandler.handleChartClick);

        if (!this.restoreZoom()) {
            this.controller.resetZoom();
        }

        this.controller.subscribeCameraChange(() => this.scheduleSaveZoom());

        await this.loader.initStream(
            this.currentEpic,
            this.positionStore.activePosition?.position.direction
        );

        this.layout.setDataLoaded(true);
        void this.overlay.init(this.currentEpic);
    }

    destroy() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('beforeunload', this.saveZoom);
        }
        this.cancelPlanning();
        this.stopHeartbeat();
        this.watchdog.stop();
        this.layout.destroy();
        this.renderer.destroy();
        this.loader.disconnectStream();
        this.overlay.destroy();

        this.controller.unsubscribeClick(this.inputHandler.handleChartClick);
        this.controller.destroy();
    }

    private getStorageKey(): string {
        return `${STORAGE.CHART_STATE_KEY}_${this.currentEpic}`;
    }

    private scheduleSaveZoom() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveZoom(), 500);
    }

    private saveZoom = () => {
        if (typeof window === 'undefined') return;
        const state = this.controller.getViewState();
        if (state) {
            localStorage.setItem(this.getStorageKey(), JSON.stringify(state));
        }
    };

    private restoreZoom(): boolean {
        if (typeof window === 'undefined') return false;
        const raw = localStorage.getItem(this.getStorageKey());
        if (raw) {
            try {
                const state: ViewState = JSON.parse(raw);
                setTimeout(() => {
                    this.controller.restoreViewState(state);
                }, 100);
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }

    resetChartZoom() {
        this.controller.resetZoom();
        localStorage.removeItem(this.getStorageKey());
    }

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

    private checkLimits(currentPrice: number) {
        if (this.isBurstChecking) return;
        const pos = this.positionStore.activePosition?.position;
        if (!pos) return;
        const isBuy = pos.direction === TRADING.BUY_DIRECTION;
        let hitSL = false;
        if (pos.stopLevel) hitSL = isBuy ? currentPrice <= pos.stopLevel : currentPrice >= pos.stopLevel;
        let hitTP = false;
        if (pos.profitLevel) hitTP = isBuy ? currentPrice >= pos.profitLevel : currentPrice <= pos.profitLevel;

        if (hitSL || hitTP) void this.runBurstCheck();
    }

    private async runBurstCheck() {
        this.isBurstChecking = true;
        for (let i = 0; i < 5; i++) {
            await Promise.all([this.positionStore.refresh(), this.accountStore.refreshActive()]);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        this.isBurstChecking = false;
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(async () => {
            const now = new Date();
            const sec = now.getSeconds();
            if (sec >= 30 && sec <= 32 && this.lastSyncMinute !== now.getMinutes()) {
                this.lastSyncMinute = now.getMinutes();
                void this.marketStore.syncHistory();
            }
            if (sec % 15 === 0 && !this.isBurstChecking) {
                await this.positionStore.refresh();
            }
            if (sec < 2 && !this.isBurstChecking) {
                await this.checkRiskCompliance();
            }
        }, 1000);
    }

    private async checkRiskCompliance() {
        const position = this.positionStore.anyActivePosition;
        if (!position || !this.marketDetails) return;
        await this.accountStore.refreshActive();
        const balance = this.accountStore.balance;
        const newSL = this.riskManager.calculateCorrection(
            position.position,
            this.marketDetails,
            balance
        );
        if (newSL !== null) {
            console.log(`[RiskManager] Correction Needed. Updating SL to ${newSL}`);
            await this.positionStore.updateStopLoss(newSL);
        }
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private isInteractionBlocked(): boolean {
        if (this.tradeStore.isExecuting) return true;
        if (this.positionStore.anyActivePosition) return true;
        return false;
    }

    // NEW: Handle the click using the Domain Service
    private handleChartClick(event: ChartClickEvent) {
        if (!this.marketDetails) return;

        const bid = this.marketStore.bid;
        const offer = this.marketStore.offer;

        const intent = this.tradingDomain.determineIntent(event.price, bid, offer);

        if (intent) {
            this.marketStore.setDataSource(intent.source);
            this.tradeStore.plan(
                intent.entryPrice,
                intent.targetPrice,
                intent.direction,
                this.marketDetails,
                this.userLeverage
            );
        }
    }

    private async handleFreeze() {
        console.warn("Freeze detected, reloading stream...");
        await this.loader.reconnectStream(this.currentEpic);
    }
}