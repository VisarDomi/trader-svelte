import { goto } from '$app/navigation';
import * as TRADING from '$lib/constants/trading.js';
import * as AUTH from '$lib/constants/auth.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { getMarketDetails } from '$lib/services/market.js';
import { getPreferences } from '$lib/services/account.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { AccountPreferences, LeverageCategory } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class InstrumentLogic {
    targetEpics = [TRADING.NDX_EPIC, TRADING.BTCUSD_EPIC];

    instruments = $state<MarketDetailsResponse[]>([]);
    userPreferences = $state<AccountPreferences | null>(null);

    isLoading = $state(true);
    error = $state('');

    async init() {
        if (typeof window === 'undefined') return;
        await this.load();
    }

    async load() {
        this.isLoading = true;
        this.error = '';

        // Try REAL tokens first, then DEMO. This page is just for information,
        // but we need a valid session to fetch market data.
        const realTokens = session.getTokens(AUTH.REAL_TYPE);
        const demoTokens = session.getTokens(AUTH.DEMO_TYPE);

        let type: URL_TYPE = AUTH.REAL_TYPE;
        let validTokens = realTokens;

        if (!validTokens) {
            type = AUTH.DEMO_TYPE;
            validTokens = demoTokens;
        }

        if (!validTokens) {
            await goto('/login');
            return;
        }

        const client = session.getClient(type);
        // Should not happen given validTokens check above, but for type safety:
        if (!client) {
            await goto('/login');
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
            this.error = e instanceof Error ? e.message : String(e);
            notifications.error("Failed to load instruments");
        } finally {
            this.isLoading = false;
        }
    }

    select(epic: string) {
        if (typeof window !== 'undefined') {
            session.lastEpic = epic;
        }
        goto('/chart');
    }

    getUserLeverage(market: MarketDetailsResponse): string {
        const category = market.instrument.type as LeverageCategory;

        if (this.userPreferences && this.userPreferences.leverages[category]) {
            return `1:${this.userPreferences.leverages[category].current}`;
        }

        if (market.instrument.marginFactorUnit === 'PERCENTAGE' && market.instrument.marginFactor > 0) {
            const lev = Math.round(100 / market.instrument.marginFactor);
            return `1:${lev} (Default)`;
        }

        return `${market.instrument.marginFactor}%`;
    }
}