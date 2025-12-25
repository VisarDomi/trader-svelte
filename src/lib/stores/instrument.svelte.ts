import { BaseStore } from '$lib/core/BaseStore.svelte.js';
import { getMarketDetails } from '$lib/services/market.js';
import { getPreferences } from '$lib/services/account.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import * as TRADING from '$lib/constants/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { AccountPreferences } from '$lib/types/account.js';

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

    select(epic: string) {
        // session imported dynamically or via import?
        // We need to import session since BaseStore doesn't handle 'select' logic
        import('$lib/services/session.js').then(({ session }) => {
            session.lastEpic = epic;
        });
    }
}

export const instrumentStore = new InstrumentStore();