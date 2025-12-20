import {goto} from '$app/navigation';
import * as TRADING from '$lib/constants/trading.js';
import * as STORAGE from '$lib/constants/storage.js';
import {getMarketDetails} from '$lib/services/market.js';
import type {MarketDetailsResponse} from '$lib/types/market.js';
import type {SessionTokens} from '$lib/types/auth.js';

export class InstrumentLogic {
    // The Watchlist
    targetEpics = [TRADING.NDX_EPIC, TRADING.BTCUSD_EPIC];

    instruments = $state<MarketDetailsResponse[]>([]);
    isLoading = $state(true);
    error = $state('');

    async init() {
        if (typeof window === 'undefined') return;
        await this.load();
    }

    async load() {
        this.isLoading = true;
        this.error = '';

        // Prioritize Real tokens for data, fallback to Demo
        let tokensStr = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);

        if (!tokensStr) {
            await goto('/login');
            return;
        }

        try {
            const tokens: SessionTokens = JSON.parse(tokensStr);

            // Fetch all watchlist items concurrently
            this.instruments = await Promise.all(
                this.targetEpics.map(epic => getMarketDetails(tokens, epic))
            );
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

    getLeverage(m: MarketDetailsResponse): string {
        if (m.instrument.marginFactorUnit === 'PERCENTAGE' && m.instrument.marginFactor > 0) {
            const lev = Math.round(100 / m.instrument.marginFactor);
            return `1:${lev}`;
        }
        return `${m.instrument.marginFactor}%`;
    }
}