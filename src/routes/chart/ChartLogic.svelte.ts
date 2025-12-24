import { viewport } from '$lib/services/viewport.svelte.js';
import * as TRADING from '$lib/constants/trading.js';
import * as STORAGE from '$lib/constants/storage.js';
import { notifications } from '$lib/services/notifications.svelte.js';

import { ChartController, type ChartState } from './ChartController.js';
import { ChartUI } from './ChartUI.svelte.js';
import { ChartRenderer } from './ChartRenderer.svelte.js';
import { ChartOverlay } from './ChartOverlay.svelte.js';
import { ChartInputHandler, type TradeIntent } from './ChartInputHandler.svelte.js';
import { ChartDataLoader } from './ChartLoader.svelte.js';
import { Watchdog } from '$lib/services/watchdog.svelte.js';

import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { TradeStore } from '$lib/stores/trade.svelte.js';
import type { SessionManager } from '$lib/services/session.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { UTCTimestamp } from 'lightweight-charts';

export class ChartLogic {
    layout = new ChartUI(viewport);
    overlay: ChartOverlay;
    controller = new ChartController();

    private renderer: ChartRenderer;
    private inputHandler: ChartInputHandler;
    private loader: ChartDataLoader;
    private watchdog: Watchdog;

    private currentEpic = "";
    private userLeverage = 1;
    private marketDetails: MarketDetailsResponse | null = null;

    // Polling & Sentinel State
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private isBurstChecking = false;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    // Feature: Mid-minute sync
    private lastSyncMinute = -1;

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

        this.inputHandler = new ChartInputHandler(
            marketStore,
            (intent) => this.handleTradeIntent(intent),
            () => this.isInteractionBlocked()
        );

        $effect(() => {
            const price = this.marketStore.currentPrice;
            if (price > 0 && this.positionStore.activePosition) {
                this.checkLimits(price);
            }
        });
    }

    async init(container: HTMLDivElement) {
        const authorized = await this.loader.ensureSession();
        if (!authorized) return;

        this.currentEpic = this.session.lastEpic;
        this.watchdog.start();
        this.startHeartbeat();

        this.controller.init(container);
        this.layout.init(this.controller.chart, container);

        const context = await this.loader.loadContext(this.currentEpic);
        if (!context) return;

        this.userLeverage = context.userLeverage;
        this.marketDetails = context.marketDetails;

        this.controller.createMainSeries(context.precision);

        // --- GHOST SERIES EXTENSION ---
        // Ensure continuous time resolution into the future (24H).
        // Using isolated priceScale to prevent affecting main chart.
        if (this.marketDetails.instrument.overnightFee?.swapChargeTimestamp) {
            const currentPrice = this.marketDetails.snapshot.bid;
            if (currentPrice > 0) {
                this.controller.extendTimeScale24H(currentPrice);
            }
        }
        // ------------------------------

        this.renderer.init(this.controller.series, this.marketDetails);
        this.inputHandler.configure(this.controller.series);
        this.controller.subscribeClick(this.inputHandler.handleChartClick);

        // Feature: Restore Zoom or Default to Now
        // Note: restoreZoom is async in effect (uses setTimeout internally).
        // If it finds nothing, we want to ensure we aren't stuck 24h in the future.
        if (!this.restoreZoom()) {
            const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
            this.controller.scrollToTimestamp(now);
        }

        // Listen for Zoom changes
        this.controller.subscribeCameraChange(() => this.scheduleSaveZoom());

        await this.loader.initStream(
            this.currentEpic,
            this.positionStore.activePosition?.position.direction
        );

        this.layout.setDataLoaded(true);
        void this.overlay.init(this.currentEpic);
    }

    destroy() {
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

    // --- Feature: Zoom Persistence ---

    private scheduleSaveZoom() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveZoom(), 1000);
    }

    private saveZoom() {
        if (typeof window === 'undefined') return;
        const state = this.controller.getState();
        if (state) {
            localStorage.setItem(STORAGE.CHART_STATE_KEY, JSON.stringify(state));
        }
    }

    /**
     * returns true if restore was attempted (state existed), false otherwise.
     */
    private restoreZoom(): boolean {
        if (typeof window === 'undefined') return false;
        const raw = localStorage.getItem(STORAGE.CHART_STATE_KEY);
        if (raw) {
            try {
                const state: ChartState = JSON.parse(raw);
                setTimeout(() => {
                    this.controller.restoreState(state);
                }, 200);
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }

    resetChartZoom() {
        this.controller.resetZoom();
        localStorage.removeItem(STORAGE.CHART_STATE_KEY);
    }

    // --- Trade Logic ---

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

    // --- Sentinel & Heartbeat ---

    private checkLimits(currentPrice: number) {
        if (this.isBurstChecking) return;
        // ... (existing limit logic)
        const pos = this.positionStore.activePosition?.position;
        if (!pos) return;
        const isBuy = pos.direction === TRADING.BUY_DIRECTION;
        let hitSL = false;
        if (pos.stopLevel) hitSL = isBuy ? currentPrice <= pos.stopLevel : currentPrice >= pos.stopLevel;
        let hitTP = false;
        if (pos.profitLevel) hitTP = isBuy ? currentPrice >= pos.profitLevel : currentPrice <= pos.profitLevel;

        if (hitSL || hitTP) this.runBurstCheck();
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

        this.heartbeatInterval = setInterval(() => {
            const now = new Date();
            const sec = now.getSeconds();

            // Feature: Mid-Minute History Sync
            if (sec >= 30 && sec <= 32 && this.lastSyncMinute !== now.getMinutes()) {
                this.lastSyncMinute = now.getMinutes();
                this.marketStore.syncHistory();
            }

            // General background sync
            if (sec % 15 === 0 && !this.isBurstChecking) {
                this.positionStore.refresh();
            }
        }, 1000);
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

    private handleTradeIntent(intent: TradeIntent) {
        if (!this.marketDetails) return;
        this.marketStore.setDataSource(intent.source);
        this.tradeStore.plan(intent.entryPrice, intent.targetPrice, intent.direction, this.marketDetails, this.userLeverage);
    }

    private async handleFreeze() {
        console.warn("Freeze detected, reloading stream...");
        await this.loader.reconnectStream(this.currentEpic);
    }
}