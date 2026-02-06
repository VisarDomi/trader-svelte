import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { TradePlanner, type PlannedTrade } from '$lib/features/trade-execution/TradePlanner.js';
import { TradeExecutor } from '$lib/features/trade-execution/TradeExecutor.js';
import { MarketMapper } from '$lib/domains/market/domain/MarketMapper.js';
import { bus } from '$lib/core/events/globalBus.js'; // NEW: Event Bus

import * as TRADING from '$lib/shared/constants/trading.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import type { Direction, PositionResponse, PositionBody } from '$lib/shared/types/trading.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';

import { accountStore } from './AccountStore.svelte.js';
import { marketStore } from '$lib/domains/market/stores/MarketStore.svelte.js';
// REMOVED: import { positionStore } from './position.svelte.js';

interface TradeDraft {
    direction: Direction;
    leverage: number;
    market: MarketDetailsResponse;
    profitDistance: number;
}

export class TradeStore {
    isPlanning = $state(false);
    isExecuting = $state(false);

    private draft = $state<TradeDraft | null>(null);

    private planner = new TradePlanner();
    private executor = new TradeExecutor();

    plannedTrade = $derived.by<PlannedTrade | null>(() => {
        if (!this.draft) return null;

        const { direction, leverage, market, profitDistance } = this.draft;
        const balance = accountStore.balance;

        const liveEntry = direction === TRADING.BUY_DIRECTION
            ? marketStore.offer
            : marketStore.bid;

        if (!liveEntry) return null;

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
            return null;
        }
    });

    plan(
        initialEntryPrice: number,
        initialTargetPrice: number,
        direction: Direction,
        market: MarketDetailsResponse,
        userLeverage: number
    ) {
        const profitDistance = Math.abs(initialTargetPrice - initialEntryPrice);

        this.draft = {
            direction,
            leverage: userLeverage,
            market,
            profitDistance
        };

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
                notifications.error("Calculated size below minimum deal size.");
                this.cancel();
                return;
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

            // NEW: Emit event instead of modifying other stores directly
            bus.emit(EVENTS.TRADE_EXECUTED, result);

            return result;

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // NEW: Emit failure event
            bus.emit(EVENTS.TRADE_FAILED, { reason: msg });
            notifications.error(msg);
            return null;
        } finally {
            this.isExecuting = false;
        }
    }

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

        const mockMarket = MarketMapper.toPositionMarket(draft.market);

        return {
            market: mockMarket,
            position: mockBody
        };
    }
}

export const tradeManager = new TradeStore();