import { getAccounts } from '$lib/services/account.js';
import { getMarketInfo } from '$lib/services/market.js';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import type { Account } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { SessionTokens } from '$lib/types/auth.js';

export class ChartOverlay {
    isOpen = $state(false);
    account = $state<Account | null>(null);
    loading = $state(false);
    mode = $state<URL_TYPE>(AUTH.DEMO_TYPE);
    marketName = $state('');

    async init(epic: string) {
        if (typeof window === 'undefined') return;

        this.loading = true;
        this.marketName = epic; // Default to ticker until loaded

        // 1. Determine Trading Mode
        const storedMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE;
        this.mode = storedMode || AUTH.DEMO_TYPE;

        // 2. Get Tokens for that mode
        const storageKey = this.mode === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);

        if (tokensStr) {
            try {
                const tokens: SessionTokens = JSON.parse(tokensStr);

                // Fetch Account and Market Info in parallel
                const [accounts, name] = await Promise.all([
                    getAccounts(this.mode, tokens),
                    getMarketInfo(this.mode, tokens, epic)
                ]);

                this.account = accounts.find(a => a.preferred) || accounts[0] || null;
                this.marketName = name;

            } catch (e) {
                console.error("Failed to load overlay data", e);
            }
        }

        this.loading = false;
    }

    toggle() {
        this.isOpen = !this.isOpen;
    }
}