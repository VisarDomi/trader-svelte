import { viewport } from '$lib/core/services/ViewportService.svelte.js';

import { ChartController } from '$lib/components/chart-engine/ChartController.js';
import { ChartUI } from '$lib/components/chart-engine/ChartResizer.svelte.js';
import { getTimeScaleHeight } from '$lib/components/chart-engine/config.js';
import { isIOS } from '$lib/core/utils/platform.js';
import { ChartRenderer } from '$lib/features/chart-orchestration/ChartPluginManager.svelte.js';
import { ChartOverlay } from '$lib/features/chart-hud/ChartHudState.svelte.js';
import { ChartInputHandler } from '$lib/components/chart-engine/ChartEvents.svelte.js';
import { ChartLoader, type ChartContext as LoaderContext } from '$lib/features/chart-orchestration/ChartLoader.svelte.js';
import { marketDataPump } from '$lib/domains/market/services/MarketDataPump.js';

import { ChartStateManager } from '$lib/features/chart-orchestration/ChartStateManager.svelte.js';
import { ChartInteractionManager } from '$lib/features/chart-orchestration/ChartInteractionManager.svelte.js';

import { ChartContext } from '$lib/features/chart-orchestration/ChartContext.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';

import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { tradeManager as tradeStore } from '$lib/domains/trading/stores/TradeStore.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';
import * as EVENTS from '$lib/shared/constants/events.js';

import type { MarketDetailsResponse } from '$lib/shared/types/market.js';

export class ChartLogic {

    layout = new ChartUI(viewport);
    controller = new ChartController();
    overlay: ChartOverlay;

    stateManager: ChartStateManager;
    interactionManager: ChartInteractionManager;

    context = new ChartContext();

    private renderer: ChartRenderer;
    private inputHandler: ChartInputHandler;
    private loader: ChartLoader;

    private marketDetails = $state<MarketDetailsResponse | null>(null);
    private cleanupEvents: (() => void)[] = [];

    constructor() {
        this.overlay = new ChartOverlay(accountStore, positionStore, session, this);
        this.loader = new ChartLoader(accountStore, positionStore, marketStore);

        this.stateManager = new ChartStateManager(this.controller, this.layout);
        this.interactionManager = new ChartInteractionManager();

        this.renderer = new ChartRenderer(
            this.controller.camera,
            this.stateManager,
            marketStore,
            positionStore,
            tradeStore,
            accountStore
        );

        this.inputHandler = new ChartInputHandler(
            () => this.interactionManager.isInteractionBlocked()
        );

        this.setupSubscriptions();

        $effect(() => this.syncContext());
    }

    async init(container: HTMLDivElement) {
        const authorized = await this.loader.ensureSession();
        if (!authorized) return;

        this.controller.init(container);
        this.configureLayout(container);
        this.stateManager.initListeners();

        const lastEpic = session.lastEpic;
        if (lastEpic) {
            await this.loadAndApplyEpic(lastEpic);
        }

        this.initializeInteractions();

        this.layout.setDataLoaded(true);

        marketDataPump.requestSyncOnNextTick();
    }

    destroy() {
        this.cleanupEvents.forEach(fn => fn());

        this.stateManager.destroy();
        this.interactionManager.cancelPlanning();

        this.layout.destroy();
        this.renderer.destroy();
        this.overlay.destroy();

        this.controller.unsubscribeClick(this.inputHandler.handleChartClick);
        this.controller.destroy();
    }

    resetChartZoom() {
        this.stateManager.reset();
    }

    confirmTrade() {
        void this.interactionManager.confirmTrade();
    }

    cancelPlanning() {
        this.interactionManager.cancelPlanning();
    }

    private setupSubscriptions() {

        const offClick = bus.on(EVENTS.INPUT_CHART_CLICK, (event) => {
            this.interactionManager.handleChartClick(event);
        });

        const offMarket = bus.on(EVENTS.MARKET_SELECTED, (event) => {
            void this.handleEpicSwitch(event.epic);
        });

        this.cleanupEvents.push(offClick, offMarket);
    }

    private async handleEpicSwitch(newEpic: string) {
        this.interactionManager.cancelPlanning();
        await this.loadAndApplyEpic(newEpic);
    }

    private async loadAndApplyEpic(epic: string) {

        this.stateManager.setEpic(epic);

        const context = await this.loader.loadContext(epic);
        if (!context) return;

        this.marketDetails = context.marketDetails;
        this.applyContext(context);

        this.interactionManager.updateContext(context.marketDetails, context.userLeverage);

        this.initializeRenderer(context);

        void this.overlay.init(epic);
    }

    private configureLayout(container: HTMLDivElement) {
        let oldPriceH = 0;
        let captured: ReturnType<typeof this.controller.camera.captureViewport> = null;
        const isPwa = isIOS();

        this.layout.init(this.controller.chart, container, {
            onBeforeResize: (oldWidth, oldHeight) => {
                oldPriceH = oldHeight - getTimeScaleHeight(isPwa, oldWidth > oldHeight);
                captured = this.controller.camera.captureViewport();
            },
            onAfterResize: (newWidth, newHeight) => {
                if (captured) {
                    const newPriceH = newHeight - getTimeScaleHeight(isPwa, newWidth > newHeight);
                    this.controller.camera.applyResize(captured, oldPriceH, newPriceH);
                }
            }
        });
    }

    private applyContext(context: LoaderContext) {

        this.controller.createMainSeries(context.precision);

        if (this.marketDetails?.instrument.overnightFee?.swapChargeTimestamp) {
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
}
