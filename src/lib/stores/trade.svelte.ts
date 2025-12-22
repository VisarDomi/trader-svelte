import { notifications } from '$lib/services/notifications.svelte.js';
import { api } from '$lib/services/api.svelte.js';
import { TradePlanner, type PlannedTrade } from '$lib/domain/trade/TradePlanner.js';
import { TradeExecutor } from '$lib/domain/trade/TradeExecutor.js';

import * as TRADING from '$lib/constants/trading.js';
import type { Direction, PositionResponse, PositionBody } from '$lib/types/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';

// Dependencies
import { accountStore } from './account.svelte.js';
import { positionStore } from './position.svelte.js';
import { marketStore } from './market.svelte.js';

interface TradeDraft {
    direction: Direction;
    leverage: number;
    market: MarketDetailsResponse;
    profitDistance: number;
}

export class TradeStore {
    // State
    isPlanning = $state(false);
    isExecuting = $state(false);

    // Internal Draft State (Immutable parameters of the plan)
    private draft = $state<TradeDraft | null>(null);

    // Internal Services
    private planner = new TradePlanner();
    private executor = new TradeExecutor();

    /**
     * Reactive Plan: Recalculates whenever market prices change or draft changes.
     * This ensures the "Target Price" and "Stop Loss" float with the current market price
     * while maintaining the user's initial relative distance.
     */
    plannedTrade = $derived.by<PlannedTrade | null>(() => {
        if (!this.draft) return null;

        const { direction, leverage, market, profitDistance } = this.draft;
        const balance = accountStore.balance;

        // 1. Get Live Entry Price
        // If Buying, we enter at Ask (Offer)
        // If Selling, we enter at Bid
        const liveEntry = direction === TRADING.BUY_DIRECTION
            ? marketStore.offer
            : marketStore.bid;

        // If market data isn't ready yet (0), abort
        if (!liveEntry) return null;

        // 2. Calculate Live Target Price based on fixed distance
        // Buy: Target is above entry
        // Sell: Target is below entry
        const liveTarget = direction === TRADING.BUY_DIRECTION
            ? liveEntry + profitDistance
            : liveEntry - profitDistance;

        try {
            return this.planner.calculate(
                market,
                balance,
                leverage,
                direction,
                liveEntry,
                liveTarget
            );
        } catch {
            // Silently fail during live updates if math temporarily breaks
            return null;
        }
    });

    /**
     * Prepares a trade based on user input (Chart Click).
     * @param initialEntryPrice - The snapshot price at the moment of click
     * @param initialTargetPrice - The chart coordinate clicked (TP)
     */
    plan(
        initialEntryPrice: number,
        initialTargetPrice: number,
        direction: Direction,
        market: MarketDetailsResponse,
        userLeverage: number
    ) {
        // Calculate the relative distance once. This gets locked in.
        const profitDistance = Math.abs(initialTargetPrice - initialEntryPrice);

        this.draft = {
            direction,
            leverage: userLeverage,
            market,
            profitDistance
        };

        // Run an immediate validation using snapshot values to reject invalid clicks (e.g. min size)
        // before we switch to the reactive mode.
        try {
            const testPlan = this.planner.calculate(
                market,
                accountStore.balance,
                userLeverage,
                direction,
                initialEntryPrice,
                initialTargetPrice
            );

            if (!testPlan) {
                throw new Error("Calculated size below minimum deal size.");
            }

            this.isPlanning = true;

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
            this.cancel();
        }
    }

    cancel() {
        this.isPlanning = false;
        this.draft = null;
    }

    /**
     * Executes the currently planned trade using the LIVE calculated values.
     */
    async execute(): Promise<PositionResponse | null> {
        const plan = this.plannedTrade;
        const draft = this.draft;

        if (!plan || !draft) return null;

        this.isExecuting = true;
        const client = api.client;

        if (!client) {
            notifications.error("Session invalid");
            this.isExecuting = false;
            return null;
        }

        try {
            const snapshotBalance = accountStore.balance;
            const currency = accountStore.activeAccount?.currency || "USD";

            const result = await this.executor.execute(
                client,
                plan,
                draft.market,
                currency,
                snapshotBalance
            );

            notifications.success(`${result.position.direction} ${result.position.size} Executed`);

            this.cancel();

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
     * Creates a temporary "Position" object from the current reactive plan.
     * Used by the Chart Lines to visualize the trade dynamically.
     */
    getMockPosition(): PositionResponse | null {
        const plan = this.plannedTrade;
        const draft = this.draft;

        if (!plan || !draft) return null;

        const mockBody: PositionBody = {
            contractSize: 0,
            createdDate: new Date().toISOString(),
            createdDateUTC: new Date().toISOString(),
            dealId: "planning",
            dealReference: "planning",
            size: plan.size,
            leverage: 1,
            upl: 0,
            direction: plan.direction,
            level: plan.entryPrice,
            currency: draft.market.instrument.currency,
            guaranteedStop: false,
            stopLevel: plan.stopLevel,
            profitLevel: plan.profitLevel,
            initialBalance: accountStore.balance
        };

        return {
            market: draft.market.snapshot as any,
            position: mockBody
        };
    }
}

export const tradeManager = new TradeStore();