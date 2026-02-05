import { viewport } from '$lib/core/services/ViewportService.svelte.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import * as STORAGE from '$lib/shared/constants/storage.js';

import { ChartController, type ViewState } from '$lib/components/chart-engine/ChartController';
import { ChartUI } from '$lib/components/chart-engine/ChartResizer.svelte';
import { ChartRenderer } from '$lib/features/chart-orchestration/ChartPluginManager.svelte.js';
import { ChartOverlay } from '$lib/features/chart-hud/ChartHudState.svelte.js';
import { ChartInputHandler, type ChartClickEvent } from '$lib/components/chart-engine/ChartEvents.svelte';
import { ChartLoader, type ChartContext as LoaderContext } from '$lib/features/chart-orchestration/ChartLoader.svelte.js';
import { TradingDomain } from '$lib/domains/trading/domain/TradingDomain.js';

import { ChartContext } from '$lib/features/chart-orchestration/ChartContext.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';

// Import Singletons directly
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { tradeManager as tradeStore } from '$lib/domains/trading/stores/TradeStore.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';

import type { MarketDetailsResponse } from '$lib/shared/types/market.js';

export class ChartLogic {
    layout = new ChartUI(viewport);
    overlay: ChartOverlay;
    controller = new ChartController();

    context = new ChartContext();

    private renderer: ChartRenderer;
    private inputHandler: ChartInputHandler;
    private loader: ChartLoader;
    // Removed: RiskManager
    private tradingDomain = new TradingDomain();

    private currentEpic = "";
    private userLeverage = 1;

    private marketDetails = $state<MarketDetailsResponse | null>(null);

    // Removed: heartbeatInterval, isBurstChecking, lastSyncMinute
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private preResizeState: ViewState | null = null;

    constructor() {
        this.overlay = new ChartOverlay(accountStore, positionStore, session, this);
        this.loader = new ChartLoader(accountStore, positionStore, marketStore);
        this.renderer = new ChartRenderer(marketStore, positionStore, tradeStore, accountStore);

        this.inputHandler = new ChartInputHandler(
            () => this.isInteractionBlocked()
        );

        // ACTIVATE AUTONOMOUS MARKET STORE
        marketStore.autoConnect();

        bus.on('input:chart_click', (event) => this.handleChartClick(event));

        $effect(() => this.syncContext());
    }

    async init(container: HTMLDivElement) {
        const authorized = await this.loader.ensureSession();
        if (!authorized) return;

        this.setupEventListeners();
        this.startServices();

        this.controller.init(container);
        this.configureLayout(container);

        const context = await this.loader.loadContext(session.lastEpic);
        if (!context) return;

        this.applyContext(context);
        this.initializeRenderer(context);
        this.initializeInteractions();

        if (!this.restoreZoom()) {
            this.controller.resetZoom();
        }

        this.controller.subscribeCameraChange(() => this.scheduleSaveZoom());

        this.layout.setDataLoaded(true);
        void this.overlay.init(this.currentEpic);
    }

    destroy() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('beforeunload', this.saveZoom);
        }
        this.cancelPlanning();
        // Removed: this.stopHeartbeat()
        this.layout.destroy();
        this.renderer.destroy();
        this.overlay.destroy();

        this.controller.unsubscribeClick(this.inputHandler.handleChartClick);
        this.controller.destroy();
    }

    resetChartZoom() {
        this.controller.resetZoom();
        localStorage.removeItem(this.getStorageKey());
    }

    async confirmTrade() {
        const result = await tradeStore.execute();
        if (result) {
            const source = result.position.direction === TRADING.SELL_DIRECTION
                ? TRADING.CHART_DATA_SOURCE_OFR
                : TRADING.CHART_DATA_SOURCE_BID;
            marketStore.setDataSource(source);
        }
    }

    cancelPlanning() {
        tradeStore.cancel();
        if (!positionStore.activePosition) {
            marketStore.setDataSource(TRADING.CHART_DATA_SOURCE_BID);
        }
    }

    private setupEventListeners() {
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this.saveZoom);
        }
    }

    private startServices() {
        this.currentEpic = session.lastEpic;
        // Removed: this.startHeartbeat()
    }

    private configureLayout(container: HTMLDivElement) {
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
    }

    private applyContext(context: LoaderContext) {
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
    }

    private initializeRenderer(context: LoaderContext) {
        this.renderer.init(this.controller.chart, this.controller.series, this.context);
    }

    private initializeInteractions() {
        this.inputHandler.configure(this.controller.series);
        this.controller.subscribeClick(this.inputHandler.handleChartClick);
    }

    private syncContext() {
        this.context.marketDetails = this.marketDetails;
        this.context.currentPrice = marketStore.currentPrice;
        this.context.lastCandle = marketStore.lastCandle;

        if (tradeStore.isPlanning) {
            this.context.activePosition = tradeStore.getMockPosition();
            this.context.isPlanningTrade = true;
        } else {
            this.context.activePosition = positionStore.activePosition;
            this.context.isPlanningTrade = false;
        }

        this.context.accountBalance = accountStore.balance;
        this.context.activeSymbol = accountStore.activeSymbol;
        this.context.viewportWidth = this.layout.isDataLoaded ? viewport.width : 0;
        this.context.viewportHeight = this.layout.isDataLoaded ? viewport.height : 0;
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

    // Removed: checkLimits, runBurstCheck, startHeartbeat, checkRiskCompliance, stopHeartbeat
    // These are now handled by RiskService

    private isInteractionBlocked(): boolean {
        if (tradeStore.isExecuting) return true;
        if (positionStore.anyActivePosition) return true;
        return false;
    }

    private handleChartClick(event: ChartClickEvent) {
        if (!this.marketDetails) return;

        const bid = marketStore.bid;
        const offer = marketStore.offer;

        const intent = this.tradingDomain.determineIntent(event.price, bid, offer);

        if (intent) {
            marketStore.setDataSource(intent.source);
            tradeStore.plan(
                intent.entryPrice,
                intent.targetPrice,
                intent.direction,
                this.marketDetails,
                this.userLeverage
            );
        }
    }
}