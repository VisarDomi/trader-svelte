import { getPositions, createPosition, getConfirmation } from '$lib/services/trading.js';
import { resolveInitialBalance } from '$lib/utils/position.js';
import { session } from '$lib/services/session.js';
import { api } from '$lib/services/api.svelte.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { accountStore } from './account.svelte.js';
import * as TRADING from '$lib/constants/trading.js';
import type { PositionResponse } from '$lib/types/trading.js';

export class PositionStore {
    activePosition = $state<PositionResponse | null>(null);
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
            const found = list.positions.find(p => p.market.epic === this.epic);

            if (found && accountStore.activeAccount) {
                // Client-side fix for Initial Balance (for PnL calcs)
                found.position.initialBalance = resolveInitialBalance(
                    found.position,
                    accountStore.activeAccount
                );
            }

            this.activePosition = found || null;
        } catch (e) {
            console.error("Failed to load positions", e);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Manually set position (e.g. after immediate execution) to avoid wait
     */
    set(p: PositionResponse | null) {
        this.activePosition = p;
    }

    async close() {
        if (!this.activePosition) return;

        this.isClosing = true;
        const client = api.getOrThrow();

        try {
            const p = this.activePosition.position;
            const oppositeDir = p.direction === TRADING.BUY_DIRECTION
                ? TRADING.SELL_DIRECTION
                : TRADING.BUY_DIRECTION;

            const res = await createPosition(client, {
                epic: this.epic,
                direction: oppositeDir,
                size: p.size
            });

            await getConfirmation(client, res.dealReference);

            session.removeInitialBalance(p.dealId);
            notifications.success("Position Closed");

            this.activePosition = null;
            await accountStore.refresh(); // Update balance

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
        } finally {
            this.isClosing = false;
        }
    }
}

export const positionStore = new PositionStore();