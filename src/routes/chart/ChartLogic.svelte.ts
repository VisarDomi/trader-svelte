import { viewport } from '$lib/services/viewport.svelte.js';
import * as TRADING from '$lib/constants/trading.js';
import { notifications } from '$lib/services/notifications.svelte.js';

import { ChartController } from './ChartController.js';
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

    constructor(
        private marketStore: MarketStore,
        private accountStore: AccountStore,
        private positionStore: PositionStore,
        private tradeStore: TradeStore,
        private session: SessionManager
    ) {
        this.overlay = new ChartOverlay(accountStore, positionStore, session);
        this.loader = new ChartDataLoader(accountStore, positionStore, marketStore);
        this.renderer = new ChartRenderer(marketStore, positionStore, tradeStore, accountStore);
        this.watchdog = new Watchdog(() => this.handleFreeze());

        this.inputHandler = new ChartInputHandler(
            marketStore,
            (intent) => this.handleTradeIntent(intent),
            () => this.isInteractionBlocked()
        );

        // Sentinel Effect: Watch price vs Position Limits
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

        this.renderer.init(this.controller.series);
        this.inputHandler.configure(this.controller.series);
        this.controller.subscribeClick(this.inputHandler.handleChartClick);

        await this.loader.initStream(
            this.currentEpic,
            this.positionStore.activePosition?.position.direction
        );

        this.layout.setDataLoaded(true);
        void this.overlay.init(this.currentEpic);
    }

    destroy() {
        this.stopHeartbeat();
        this.watchdog.stop();
        this.layout.destroy();
        this.renderer.destroy();
        this.loader.disconnectStream();
        this.overlay.destroy();

        this.controller.unsubscribeClick(this.inputHandler.handleChartClick);
        this.controller.destroy();
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

    // --- Sentinel Logic ---

    private checkLimits(currentPrice: number) {
        // If already aggressively checking, don't trigger again
        if (this.isBurstChecking) return;

        const pos = this.positionStore.activePosition?.position;
        if (!pos) return;

        const isBuy = pos.direction === TRADING.BUY_DIRECTION;

        // Check Stop Loss Breach
        let hitSL = false;
        if (pos.stopLevel) {
            hitSL = isBuy ? currentPrice <= pos.stopLevel : currentPrice >= pos.stopLevel;
        }

        // Check Take Profit Breach
        let hitTP = false;
        if (pos.profitLevel) {
            hitTP = isBuy ? currentPrice >= pos.profitLevel : currentPrice <= pos.profitLevel;
        }

        if (hitSL || hitTP) {
            console.log("Limit hit locally - triggering burst check");
            this.runBurstCheck();
        }
    }

    private async runBurstCheck() {
        this.isBurstChecking = true;

        // Poll 1x per second for 5 seconds
        // This gives the broker time to process the close and update the list
        for (let i = 0; i < 5; i++) {
            // If position is already gone, stop checking
            if (!this.positionStore.activePosition) break;

            await this.positionStore.refresh();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.isBurstChecking = false;
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        // General background sync every 15 seconds
        // Keeps the chart in sync if you close a position on your phone
        this.heartbeatInterval = setInterval(() => {
            if (!this.isBurstChecking) {
                this.positionStore.refresh();
            }
        }, 15000);
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // --- Existing Logic ---

    private isInteractionBlocked(): boolean {
        if (this.tradeStore.isExecuting) return true;
        if (this.positionStore.anyActivePosition) {
            const p = this.positionStore.anyActivePosition;
            const isLocal = p.market.epic === this.currentEpic;
            if (!isLocal) {
                notifications.info(`Trade active in ${p.market.instrumentName}`);
            }
            return true;
        }
        return false;
    }

    private handleTradeIntent(intent: TradeIntent) {
        if (!this.marketDetails) return;

        this.marketStore.setDataSource(intent.source);

        this.tradeStore.plan(
            intent.entryPrice,
            intent.targetPrice,
            intent.direction,
            this.marketDetails,
            this.userLeverage
        );
    }

    private async handleFreeze() {
        console.warn("Freeze detected, reloading stream...");
        await this.loader.reconnectStream(this.currentEpic);
    }
}