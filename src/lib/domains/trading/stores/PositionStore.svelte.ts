import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { createPosition, updatePosition, getConfirmation } from '$lib/domains/trading/services/TradeApiService.js';
import { session } from '$lib/core/services/SessionManager.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import type { PositionResponse } from '$lib/shared/types/trading.js';

export class PositionStore extends BaseStore {
    // The "Local" position (matching the current chart)
    activePosition = $state<PositionResponse | null>(null);
    // The "Global" position (any open position, usually first found)
    anyActivePosition = $state<PositionResponse | null>(null);

    isClosing = $state(false);

    constructor() {
        super();
        bus.on('trade:executed', (pos) => {
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
    // These remain here as they are user-initiated "Writes", not autonomous "Reads".

    async close() {
        if (!this.anyActivePosition) return;

        this.isClosing = true;
        // Notify user immediately that the process has started
        notifications.info("Request sent. Waiting for confirmation...");

        const client = api.getOrThrow();

        try {
            const p = this.anyActivePosition.position;
            const marketEpic = this.anyActivePosition.market.epic;

            const oppositeDir = p.direction === TRADING.BUY_DIRECTION
                ? TRADING.SELL_DIRECTION
                : TRADING.BUY_DIRECTION;

            const res = await createPosition(client, {
                epic: marketEpic,
                direction: oppositeDir,
                size: p.size
            });

            await getConfirmation(client, res.dealReference);

            session.removeInitialBalance(p.dealId);
            notifications.success("Position Closed");

            this.activePosition = null;
            this.anyActivePosition = null;

            bus.emit('position:closed', { dealId: p.dealId, pnl: 0 });

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

            // We rely on the Poller to sync the new stop level eventually,
            // or we could trigger an immediate refresh if desired.

        } catch (e) {
            console.error("Failed to auto-correct SL", e);
            notifications.error("Risk Manager: Failed to update SL");
        }
    }
}

export const positionStore = new PositionStore();