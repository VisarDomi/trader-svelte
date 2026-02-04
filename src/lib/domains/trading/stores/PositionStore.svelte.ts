import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { getPositions, createPosition, updatePosition, getConfirmation } from '$lib/domains/trading/services/TradeApiService.js';
import { resolveInitialBalance } from '$lib/domains/trading/utils/position.js';
import { session } from '$lib/core/services/SessionManager.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { accountStore } from './AccountStore.svelte.js';
import { bus } from '$lib/core/events/globalBus.js'; // NEW: Event Bus
import * as TRADING from '$lib/shared/constants/trading.js';
import type { PositionResponse } from '$lib/shared/types/trading.js';

export class PositionStore extends BaseStore {
    activePosition = $state<PositionResponse | null>(null);
    anyActivePosition = $state<PositionResponse | null>(null);
    isClosing = $state(false);

    private epic = "";

    constructor() {
        super();
        // NEW: Listen for trades to update state immediately without a fetch
        bus.on('trade:executed', (pos) => {
            this.set(pos);
        });
    }

    async init(epic: string) {
        this.epic = epic;
        await this.refresh();
    }

    async refresh() {
        const client = this.getClient();
        if (!client) return;

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

            // Emit close event so AccountStore can update balance
            bus.emit('position:closed', { dealId: p.dealId, pnl: 0 }); // PnL 0 placeholder, account refresh handles true value

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
}

export const positionStore = new PositionStore();