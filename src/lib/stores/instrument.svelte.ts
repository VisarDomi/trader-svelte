import { getMarketDetails } from '$lib/services/market.js';
import { getPreferences } from '$lib/services/account.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import * as TRADING from '$lib/constants/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { AccountPreferences } from '$lib/types/account.js';

export class InstrumentStore {
    targetEpics = [TRADING.NDX_EPIC, TRADING.BTCUSD_EPIC];

    instruments = $state<MarketDetailsResponse[]>([]);
    userPreferences = $state<AccountPreferences | null>(null);
    isLoading = $state(false);
    error = $state("");

    async load() {
        this.isLoading = true;
        this.error = "";

        const client = api.client;
        if (!client) {
            this.error = "Session invalid";
            this.isLoading = false;
            return;
        }

        try {
            const [prefs, ...marketResults] = await Promise.all([
                getPreferences(client),
                ...this.targetEpics.map(epic => getMarketDetails(client, epic))
            ]);

            this.userPreferences = prefs;
            this.instruments = marketResults;

        } catch (e) {
            console.error("Instrument load failed", e);
            this.error = "Failed to load instruments";
            notifications.error(this.error);
        } finally {
            this.isLoading = false;
        }
    }

    select(epic: string) {
        session.lastEpic = epic;
    }

    // Helper to format leverage for UI (e.g., "1:20")
}

export const instrumentStore = new InstrumentStore();