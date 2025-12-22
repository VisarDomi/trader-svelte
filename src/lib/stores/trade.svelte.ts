import {
    calculatePositionParameters,
    type TradeCalculationResult
} from '$lib/utils/trading.js';
import { createPosition, getConfirmation } from '$lib/services/trading.js';
import { resolveInitialBalance } from '$lib/utils/position.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { api } from '$lib/services/api.svelte.js';
import * as TRADING from '$lib/constants/trading.js';
import type { Direction, TradeRequest, PositionBody, PositionResponse } from '$lib/types/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';

// Dependencies
import { accountStore } from './account.svelte.js';

export class TradeManager {
    // State
    isPlanning = $state(false);
    isExecuting = $state(false);
    plannedTrade = $state<TradeCalculationResult & { direction: Direction, entryPrice: number } | null>(null);

    // Context required for calculation (passed in during plan phase)
    private currentMarket: MarketDetailsResponse | null = null;

    /**
     * Called when user clicks the chart. Calculates potential trade parameters.
     */
    plan(
        price: number,
        direction: Direction,
        market: MarketDetailsResponse,
        userLeverage: number
    ) {
        this.currentMarket = market;
        const balance = accountStore.available;

        if (balance <= 0) {
            notifications.error("Insufficient funds to plan trade.");
            return;
        }

        const calculation = calculatePositionParameters({
            accountBalance: balance,
            leverage: userLeverage,
            entryPrice: price,
            lotSize: market.instrument.lotSize || 1,
            minSizeIncrement: market.dealingRules.minSizeIncrement.value,
            minDealSize: market.dealingRules.minDealSize.value,
            decimalPlaces: market.snapshot.decimalPlacesFactor,
            direction: direction,
            clickPrice: price,
            stopLossRatio: TRADING.STOP_LOSS_RATIO
        });

        if (!calculation) {
            notifications.error("Calculated size below minimum deal size.");
            this.cancel();
            return;
        }

        this.plannedTrade = {
            ...calculation,
            direction,
            entryPrice: price
        };
        this.isPlanning = true;
    }

    cancel() {
        this.isPlanning = false;
        this.plannedTrade = null;
        this.currentMarket = null;
    }

    /**
     * Executes the currently planned trade.
     * Returns the created Position object if successful.
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
            const tradeReq: TradeRequest = {
                epic: this.currentMarket.instrument.epic,
                direction: this.plannedTrade.direction,
                size: this.plannedTrade.size,
                stopLevel: this.plannedTrade.stopLevel,
                profitLevel: this.plannedTrade.profitLevel
            };

            // 1. Send Request
            const response = await createPosition(client, tradeReq);

            // 2. Wait for Confirmation (Poll)
            const confirmation = await getConfirmation(client, response.dealReference);

            // 3. Update Local Balance State immediately
            // (We assume the whole deposit was used/risk calculated on current balance)
            const snapshotBalance = accountStore.balance;
            session.setInitialBalance(confirmation.dealId, snapshotBalance);

            notifications.success(`${confirmation.direction} ${confirmation.size} Executed`);

            // 4. Reset Self
            this.isPlanning = false;
            this.plannedTrade = null;

            // 5. Construct a "Fake" PositionResponse to return immediately
            // so the UI updates without waiting for a full re-fetch
            const newPositionBody: PositionBody = {
                contractSize: 0, // Unknown immediately, usually fine
                createdDate: confirmation.date,
                createdDateUTC: confirmation.date,
                dealId: confirmation.dealId,
                dealReference: confirmation.dealReference,
                size: confirmation.size,
                leverage: 1, // We don't know exact leverage used by backend, but UI just needs existence
                upl: 0,
                direction: confirmation.direction,
                level: confirmation.level,
                currency: accountStore.activeAccount?.currency || "USD",
                guaranteedStop: confirmation.guaranteedStop,
                stopLevel: confirmation.stopLevel,
                profitLevel: confirmation.profitLevel,
                initialBalance: snapshotBalance
            };

            return {
                market: this.currentMarket.snapshot as any, // Cast for simplicity
                position: newPositionBody
            };

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
            return null;
        } finally {
            this.isExecuting = false;
        }
    }

    // Helper for the Line Renderer to visualize the "Ghost" position during planning
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

export const tradeManager = new TradeManager();