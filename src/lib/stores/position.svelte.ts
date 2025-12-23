import { getPositions, createPosition, getConfirmation } from '$lib/services/trading.js';
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

            await accountStore.refreshActive();

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
        } finally {
            this.isClosing = false;
        }
    }
}

export const positionStore = new PositionStore();