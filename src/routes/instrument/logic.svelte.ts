import { goto } from '$app/navigation';
import * as TRADING from '$lib/constants/trading.js';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import { ApiClient } from '$lib/api/client.js';
import { getMarketDetails } from '$lib/services/market.js';
import { getPreferences } from '$lib/services/account.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { AccountPreferences, LeverageCategory } from '$lib/types/account.js';
import type { SessionTokens } from '$lib/types/auth.js';
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

        const realTokens = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        const demoTokens = localStorage.getItem(STORAGE.TOKENS_DEMO_KEY);

        let type: URL_TYPE = AUTH.REAL_TYPE;
        let tokensStr = realTokens;

        if (!tokensStr) {
            type = AUTH.DEMO_TYPE;
            tokensStr = demoTokens;
        }

        if (!tokensStr) {
            await goto('/login');
            return;
        }

        try {
            const tokens: SessionTokens = JSON.parse(tokensStr);
            const client = new ApiClient(type, tokens);

            const [prefs, ...marketResults] = await Promise.all([
                getPreferences(client),
                ...this.targetEpics.map(epic => getMarketDetails(client, epic))
            ]);

            this.userPreferences = prefs;
            this.instruments = marketResults;

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isLoading = false;
        }
    }

    select(epic: string) {
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE.LAST_EPIC_KEY, epic);
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