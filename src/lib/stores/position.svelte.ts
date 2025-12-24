import { getPositions, createPosition, updatePosition, getConfirmation } from '$lib/services/trading.js';
import { resolveInitialBalance } from '$lib/utils/position.js';
import { session } from '$lib/services/session.js';
import { api } from '$lib/services/api.svelte.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { accountStore } from './account.svelte.js';
import * as TRADING from '$lib/constants/trading.js';
import type { PositionResponse } from '$lib/types/trading.js';

export class PositionStore {
    // The position specifically for the current epic (for drawing chart lines)
    activePosition = $state<PositionResponse | null>(null);

    // Any position on the account (for blocking new trades and showing global status)
    anyActivePosition = $state<PositionResponse | null>(null);

    isLoading = $state(false);
    isClosing = $state(false);

    private epic = "";

    async init(epic: string) {
        this.epic = epic;
        await this.refresh();
    }

    async refresh() {
        this.isLoading = true;
        const client = api.client;
        if (!client) return;

        try {
            const list = await getPositions(client);

            // Client-side fix for Initial Balance (for PnL calcs)
            // We iterate ALL positions to ensure data integrity
            if (accountStore.activeAccount) {
                for (const p of list.positions) {
                    p.position.initialBalance = resolveInitialBalance(
                        p.position,
                        accountStore.activeAccount
                    );
                }
            }

            // 1. Identify if ANY position exists (Global Lock)
            const globalPos = list.positions[0] || null;

            // 2. Identify if LOCAL position exists (Chart Lines)
            const localPos = list.positions.find(p => p.market.epic === this.epic);

            this.anyActivePosition = globalPos;
            this.activePosition = localPos || null;

        } catch (e) {
            console.error("Failed to load positions", e);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Manually set position (e.g. after immediate execution)
     */
    set(p: PositionResponse | null) {
        this.activePosition = p;
        this.anyActivePosition = p;
    }

    async close() {
        if (!this.anyActivePosition) return;

        this.isClosing = true;
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

            // Trigger poll burst to catch balance update
            this.pollBalanceUpdate();

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

            // IDEMPOTENCY:
            // We must send the COMPLETE state of the protection orders.
            // If we omit profitLevel, the broker might remove it.
            const payload = {
                stopLevel: newLevel,
                profitLevel: p.profitLevel,
                guaranteedStop: p.guaranteedStop,
                trailingStop: false // We don't support trailing stops in this logic yet
            };

            await updatePosition(mode, tokens, p.dealId, payload);

            notifications.success(`Stop Loss Auto-Corrected to ${newLevel}`);

            // Refresh to confirm changes in UI
            await this.refresh();

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("Failed to auto-correct SL", e);
            notifications.error("Risk Manager: Failed to update SL");
        }
    }

    private async pollBalanceUpdate() {
        // Poll every 1s for 10 seconds to catch the balance update from broker
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await accountStore.refreshActive();
        }
    }
}

export const positionStore = new PositionStore();