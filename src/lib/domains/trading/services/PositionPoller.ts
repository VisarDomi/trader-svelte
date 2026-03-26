import { getPositions } from '$lib/domains/trading/services/TradeApiService.js';
import { resolveInitialBalance } from '$lib/domains/trading/utils/position.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { positionCmd } from '$lib/domains/trading/stores/PositionCommands.js';
import { log } from '$lib/shared/utils/log.js';

export class PositionPoller {
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private currentEpic: string = "";

    setEpic(epic: string) {
        this.currentEpic = epic;

        if (this.isRunning) {
            void this.fetchAndSync();
        }
    }

    get isRunning() {
        return this.intervalId !== null;
    }

    start() {
        this.stop();

        void this.fetchAndSync();

        this.intervalId = setInterval(() => {
            void this.fetchAndSync();
        }, 15000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async refresh() {
        await this.fetchAndSync();
    }

    private async fetchAndSync() {

        const client = api.client;
        if (!client) return;

        try {
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

            const localPos = this.currentEpic
                ? list.positions.find(p => p.market.epic === this.currentEpic) || null
                : null;

            positionStore.dispatch(positionCmd.sync(globalPos, localPos));

        } catch (e) {
            log.warn('[PositionPoller] Fetch failed', e);
        }
    }
}

export const positionPoller = new PositionPoller();
