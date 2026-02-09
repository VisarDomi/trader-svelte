import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { createPosition, updatePosition, getConfirmation } from '$lib/domains/trading/services/TradeApiService.js';
import { session } from '$lib/core/services/SessionManager.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';
import { TradeCalculator } from '$lib/domains/trading/domain/TradeCalculator.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import type { PositionResponse } from '$lib/shared/types/trading.js';

export class PositionStore extends BaseStore {
    // The "Local" position (matching the current chart)
    activePosition = $state<PositionResponse | null>(null);
    // The "Global" position (any open position, usually first found)
    anyActivePosition = $state<PositionResponse | null>(null);

    isClosing = $state(false);

    private calculator = new TradeCalculator();

    constructor() {
        super();
        bus.on(EVENTS.TRADE_EXECUTED, (pos) => {
            // Optimistic update
            this.activePosition = pos;
            this.anyActivePosition = pos;
        });
    }

    /**
     * Called by the Poller to update state.
     * Pure state setter.
     */
    sync(globalPos: PositionResponse | null, localPos: PositionResponse | null) {
        this.anyActivePosition = globalPos;
        this.activePosition = localPos;
    }

    // --- Actions (User Triggered) ---

    async close() {
        if (!this.anyActivePosition) return;

        this.isClosing = true;
        notifications.info("Request sent. Waiting for confirmation...");

        const client = api.getOrThrow();

        try {
            const p = this.anyActivePosition.position;
            const marketEpic = this.anyActivePosition.market.epic;

            const oppositeDir = p.direction === TRADING.BUY_DIRECTION
                ? TRADING.SELL_DIRECTION
                : TRADING.BUY_DIRECTION;

            // 1. Send Request
            const res = await createPosition(client, {
                epic: marketEpic,
                direction: oppositeDir,
                size: p.size
            });

            // 2. Await Server Confirmation (contains execution price)
            const conf = await getConfirmation(client, res.dealReference);

            // 3. Calculate Realized PnL locally
            // We use the calculator to ensure logic matches the UI
            const result = this.calculator.calculatePnL(
                p.level,            // Entry Price
                conf.level,         // Exit Price (from confirmation)
                p.size,             // Size
                p.direction,        // Direction
                0                   // Initial Balance irrelevant for raw PnL calculation
            );

            session.removeInitialBalance(p.dealId);
            notifications.success(`Position Closed. PnL: ${result.rawPnL.toFixed(2)}`);

            // 4. Clear local state
            this.activePosition = null;
            this.anyActivePosition = null;

            // 5. Emit Event with Realized PnL for AccountStore to consume
            bus.emit(EVENTS.POSITION_CLOSED, {
                dealId: p.dealId,
                pnl: result.rawPnL
            });

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
        } finally {
            this.isClosing = false;
        }
    }

    async updateStopLoss(newLevel: number) {
        if (!this.anyActivePosition) return;

        const mode = session.mode;
        const tokens = session.getTokens(mode);
        if (!tokens) return;

        try {
            const p = this.anyActivePosition.position;
            const payload = {
                stopLevel: newLevel,
                profitLevel: p.profitLevel,
                guaranteedStop: p.guaranteedStop,
                trailingStop: false
            };

            await updatePosition(mode, tokens, p.dealId, payload);
            notifications.success(`Stop Loss Auto-Corrected to ${newLevel}`);

        } catch (e) {
            console.error("[RiskService] Failed to auto-correct SL", e);
        }
    }
}

export const positionStore = new PositionStore();