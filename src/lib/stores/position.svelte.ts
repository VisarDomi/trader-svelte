import { BaseStore } from '$lib/core/BaseStore.svelte.js';
import { getPositions, createPosition, updatePosition, getConfirmation } from '$lib/services/trading.js';
import { resolveInitialBalance } from '$lib/utils/position.js';
import { session } from '$lib/services/session.js';
import { api } from '$lib/services/api.svelte.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { accountStore } from './account.svelte.js';
import * as TRADING from '$lib/constants/trading.js';
import type { PositionResponse } from '$lib/types/trading.js';

export class PositionStore extends BaseStore {
    activePosition = $state<PositionResponse | null>(null);
    anyActivePosition = $state<PositionResponse | null>(null);
    isClosing = $state(false);

    private epic = "";

    async init(epic: string) {
        this.epic = epic;
        await this.refresh();
    }

    async refresh() {
        const client = this.getClient();
        if (!client) return;

        // We use execute() but handle the result manually since we need to parse lists
        await this.execute(async () => {
            const list = await getPositions(client);

            if (accountStore.activeAccount) {
                for (const p of list.positions) {
                    p.position.initialBalance = resolveInitialBalance(
                        p.position,
                        accountStore.activeAccount
                    );
                }
            }

            const globalPos = list.positions[0] || null;
            const localPos = list.positions.find(p => p.market.epic === this.epic);

            this.anyActivePosition = globalPos;
            this.activePosition = localPos || null;
        });
    }

    set(p: PositionResponse | null) {
        this.activePosition = p;
        this.anyActivePosition = p;
    }

    async close() {
        if (!this.anyActivePosition) return;

        this.isClosing = true;
        const client = api.getOrThrow(); // Or use this.getClient() but we want to throw here?

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

            void this.pollBalanceUpdate();

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
            await this.refresh();

        } catch (e) {
            console.error("Failed to auto-correct SL", e);
            notifications.error("Risk Manager: Failed to update SL");
        }
    }

    private async pollBalanceUpdate() {
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await accountStore.refreshActive();
        }
    }
}

export const positionStore = new PositionStore();