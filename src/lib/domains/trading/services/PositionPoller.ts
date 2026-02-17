import { getPositions } from '$lib/domains/trading/services/TradeApiService.js';
import { resolveInitialBalance } from '$lib/domains/trading/utils/position.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
import { log } from '$lib/shared/utils/log.js';

export class PositionPoller {
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private currentEpic: string = "";

    setEpic(epic: string) {
        this.currentEpic = epic;
        // If we are already running, trigger an immediate refresh to reflect the new epic filter
        if (this.isRunning) {
            void this.fetchAndSync();
        }
    }

    get isRunning() {
        return this.intervalId !== null;
    }

    start() {
        this.stop();

        // Immediate check
        void this.fetchAndSync();

        this.intervalId = setInterval(() => {
            void this.fetchAndSync();
        }, 15000); // 15 seconds
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Public method to force a refresh (e.g. after trade execution)
     */
    async refresh() {
        await this.fetchAndSync();
    }

    private async fetchAndSync() {
        // Accessing the client via the API service wrapper
        // If session is invalid, getClient returns null or we handle error inside api wrapper
        const client = api.client;
        if (!client) return;

        try {
            const list = await getPositions(client);

            // Business Logic: Inject Initial Balance
            // This relies on accountStore being up to date.
            if (accountStore.activeAccount) {
                for (const p of list.positions) {
                    p.position.initialBalance = resolveInitialBalance(
                        p.position,
                        accountStore.activeAccount
                    );
                }
            }

            const globalPos = list.positions[0] || null;

            // Filter for the specific chart we are looking at
            const localPos = this.currentEpic
                ? list.positions.find(p => p.market.epic === this.currentEpic) || null
                : null;

            // Push to Store (State Sync)
            positionStore.sync(globalPos, localPos);

        } catch (e) {
            log.warn('[PositionPoller] Fetch failed', e);
        }
    }
}

export const positionPoller = new PositionPoller();