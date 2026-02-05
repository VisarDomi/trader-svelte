import { viewport } from '$lib/core/services/ViewportService.svelte.js';

import { ChartController, type ViewState } from '$lib/components/chart-engine/ChartController.js'; // Keep ViewState here or move import to Camera if strictly needed, but Controller doesn't export it anymore?
import { ChartUI } from '$lib/components/chart-engine/ChartResizer.svelte.js';
import { ChartRenderer } from '$lib/features/chart-orchestration/ChartPluginManager.svelte.js';
import { ChartOverlay } from '$lib/features/chart-hud/ChartHudState.svelte.js';
import { ChartInputHandler } from '$lib/components/chart-engine/ChartEvents.svelte.js';
import { ChartLoader, type ChartContext as LoaderContext } from '$lib/features/chart-orchestration/ChartLoader.svelte.js';

// New Managers
import { ChartStateManager } from '$lib/features/chart-orchestration/ChartStateManager.svelte.js';
import { ChartInteractionManager } from '$lib/features/chart-orchestration/ChartInteractionManager.svelte.js';

import { ChartContext } from '$lib/features/chart-orchestration/ChartContext.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';

// Import Singletons
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { tradeManager as tradeStore } from '$lib/domains/trading/stores/TradeStore.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';

import type { MarketDetailsResponse } from '$lib/shared/types/market.js';

export class ChartLogic {
    // Core Engine Components
    layout = new ChartUI(viewport);
    controller = new ChartController();
    overlay: ChartOverlay;

    // Logic Delegates
    stateManager: ChartStateManager;
    interactionManager: ChartInteractionManager;

    // Shared Render State
    context = new ChartContext();

    private renderer: ChartRenderer;
    private inputHandler: ChartInputHandler;
    private loader: ChartLoader;

    // Local State
    private marketDetails = $state<MarketDetailsResponse | null>(null);
    // Note: ViewState type is now likely defined in Camera, but we treat it as opaque here
    private preResizeState: any | null = null;
    private cleanupEvents: (() => void)[] = [];

    constructor() {
        this.overlay = new ChartOverlay(accountStore, positionStore, session, this);
        this.loader = new ChartLoader(accountStore, positionStore, marketStore);

        // Pass the Camera to the Renderer
        this.renderer = new ChartRenderer(
            this.controller.camera,
            marketStore,
            positionStore,
            tradeStore,
            accountStore
        );

        // Initialize Managers
        this.stateManager = new ChartStateManager(this.controller, this.layout);
        this.interactionManager = new ChartInteractionManager();

        this.inputHandler = new ChartInputHandler(
            () => this.interactionManager.isInteractionBlocked()
        );

        this.setupSubscriptions();

        // Sync Context Effect
        $effect(() => this.syncContext());
    }

    async init(container: HTMLDivElement) {
        const authorized = await this.loader.ensureSession();
        if (!authorized) return;

        // Initialize engine
        this.controller.init(container);
        this.configureLayout(container);
        this.stateManager.initListeners();

        // Load Initial Epic
        const lastEpic = session.lastEpic;
        if (lastEpic) {
            await this.loadAndApplyEpic(lastEpic);
        }

        // Setup Interaction Layer
        this.initializeInteractions();

        // Signal UI Ready
        this.layout.setDataLoaded(true);

        // Wake up System
        import('$lib/core/engine/SystemController.js').then(({ SystemController }) => {
            SystemController.wakeUp();
        });
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

    // --- Public Actions (called by UI) ---

    resetChartZoom() {
        this.stateManager.reset();
    }

    confirmTrade() {
        void this.interactionManager.confirmTrade();
    }

    cancelPlanning() {
        this.interactionManager.cancelPlanning();
    }

    // --- Private Orchestration ---

    private setupSubscriptions() {
        // 1. Chart Clicks
        const offClick = bus.on('input:chart_click', (event) => {
            this.interactionManager.handleChartClick(event);
        });

        // 2. Context Switches
        const offMarket = bus.on('market:selected', (event) => {
            void this.handleEpicSwitch(event.epic);
        });

        this.cleanupEvents.push(offClick, offMarket);
    }

    private async handleEpicSwitch(newEpic: string) {
        // StateManager handles the "Save Old / Reset Latch" logic internally via setEpic
        // but we need to ensure the interaction manager is clean first
        this.interactionManager.cancelPlanning();

        await this.loadAndApplyEpic(newEpic);
    }

    private async loadAndApplyEpic(epic: string) {
        // 1. Update Managers
        this.stateManager.setEpic(epic);

        // 2. Load Data
        const context = await this.loader.loadContext(epic);
        if (!context) return;

        // 3. Apply Logic
        this.marketDetails = context.marketDetails;
        this.applyContext(context);

        // 4. Update Interaction Logic with new market rules/leverage
        this.interactionManager.updateContext(context.marketDetails, context.userLeverage);

        // 5. Init Renderer
        this.initializeRenderer(context);

        // 6. Init Overlay
        void this.overlay.init(epic);
    }

    private configureLayout(container: HTMLDivElement) {
        this.layout.init(this.controller.chart, container, {
            onBeforeResize: () => {
                // Use Camera for state capture
                this.preResizeState = this.controller.camera.getViewState();
            },
            onAfterResize: () => {
                if (this.preResizeState) {
                    // Use Camera for state restore
                    this.controller.camera.restoreViewState(this.preResizeState);
                    this.preResizeState = null;
                }
            }
        });
    }

    private applyContext(context: LoaderContext) {
        // Update Controller with new Precision info
        this.controller.createMainSeries(context.precision);

        // Handle 24h TimeScale extension if needed
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