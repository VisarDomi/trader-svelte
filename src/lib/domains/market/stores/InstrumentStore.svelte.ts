import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { getMarketDetails } from '$lib/domains/market/services/MarketApiService.js';
import { getPreferences } from '$lib/domains/trading/services/AccountApiService.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { SystemController } from '$lib/core/engine/SystemController.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
import type { AccountPreferences } from '$lib/shared/types/account.js';

export class InstrumentStore extends BaseStore {
    targetEpics = [TRADING.NDX_EPIC, TRADING.BTCUSD_EPIC];

    instruments = $state<MarketDetailsResponse[]>([]);
    userPreferences = $state<AccountPreferences | null>(null);

    async load() {
        const client = this.getClient();
        if (!client) return;

        await this.execute(async () => {
            const [prefs, ...marketResults] = await Promise.all([
                getPreferences(client),
                ...this.targetEpics.map(epic => getMarketDetails(client, epic))
            ]);

            this.userPreferences = prefs;
            this.instruments = marketResults;
        });

        if (this.error) {
            notifications.error(this.error);
        }
    }

    /**
     * Selects an instrument and triggers a System Context Switch.
     */
    select(epic: string) {
        // Enforce strict handoff via Controller
        SystemController.switchContext(epic);
    }
}

export const instrumentStore = new InstrumentStore();