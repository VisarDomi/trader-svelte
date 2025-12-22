import { notifications } from '$lib/services/notifications.svelte.js';
import { api } from '$lib/services/api.svelte.js';
import { TradePlanner, type PlannedTrade } from '$lib/domain/trade/TradePlanner.js';
import { TradeExecutor } from '$lib/domain/trade/TradeExecutor.js';

import type { Direction, PositionResponse, PositionBody } from '$lib/types/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';

// Dependencies
import { accountStore } from './account.svelte.js';
import { positionStore } from './position.svelte.js';

export class TradeStore {
    // State
    isPlanning = $state(false);
    isExecuting = $state(false);
    plannedTrade = $state<PlannedTrade | null>(null);

    // Internal Services
    private planner = new TradePlanner();
    private executor = new TradeExecutor();

    // Context
    private currentMarket: MarketDetailsResponse | null = null;

    /**
     * Prepares a trade based on user input (Chart Click).
     */
    plan(
        price: number,
        direction: Direction,
        market: MarketDetailsResponse,
        userLeverage: number
    ) {
        this.currentMarket = market;

        try {
            const plan = this.planner.calculate(
                market,
                accountStore.balance,
                userLeverage,
                direction,
                price
            );

            if (!plan) {
                notifications.error("Calculated size below minimum deal size.");
                this.cancel();
                return;
            }

            this.plannedTrade = plan;
            this.isPlanning = true;

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
            this.cancel();
        }
    }

    cancel() {
        this.isPlanning = false;
        this.plannedTrade = null;
        this.currentMarket = null;
    }

    /**
     * Executes the currently planned trade.
     */
    async execute(): Promise<PositionResponse | null> {
        if (!this.plannedTrade || !this.currentMarket) return null;

        this.isExecuting = true;
        const client = api.client;

        if (!client) {
            notifications.error("Session invalid");
            this.isExecuting = false;
            return null;
        }

        try {
            // Snapshot balance before execution
            const snapshotBalance = accountStore.balance;
            const currency = accountStore.activeAccount?.currency || "USD";

            const result = await this.executor.execute(
                client,
                this.plannedTrade,
                this.currentMarket,
                currency,
                snapshotBalance
            );

            notifications.success(`${result.position.direction} ${result.position.size} Executed`);

            // Reset Self
            this.cancel();

            // Update Application State
            positionStore.set(result);
            accountStore.updateBalance(snapshotBalance);

            return result;

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
            return null;
        } finally {
            this.isExecuting = false;
        }
    }

    /**
     * Creates a temporary "Position" object from the current plan.
     * Used by the Chart Lines to visualize the trade before it happens.
     */
    getMockPosition(): PositionResponse | null {
        if (!this.plannedTrade || !this.currentMarket) return null;

        const mockBody: PositionBody = {
            contractSize: 0,
            createdDate: new Date().toISOString(),
            createdDateUTC: new Date().toISOString(),
            dealId: "planning",
            dealReference: "planning",
            size: this.plannedTrade.size,
            leverage: 1,
            upl: 0,
            direction: this.plannedTrade.direction,
            level: this.plannedTrade.entryPrice,
            currency: this.currentMarket.instrument.currency,
            guaranteedStop: false,
            stopLevel: this.plannedTrade.stopLevel,
            profitLevel: this.plannedTrade.profitLevel,
            initialBalance: accountStore.balance
        };

        return {
            market: this.currentMarket.snapshot as any,
            position: mockBody
        };
    }
}

export const tradeManager = new TradeStore();