import { getSyncedAccounts } from '$lib/services/account.js';
import { getMarketDetails } from '$lib/services/market.js';
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
        this.marketName = epic; // Default to epic while loading

        const storedMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE;
        this.mode = storedMode || AUTH.DEMO_TYPE;

        const storageKey = this.mode === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);

        if (tokensStr) {
            try {
                const tokens: SessionTokens = JSON.parse(tokensStr);

                // Fetch Accounts
                const accountsPromise = getSyncedAccounts(this.mode, tokens);

                // Fetch Market Details (Name)
                const marketPromise = getMarketDetails(this.mode, tokens, epic)
                    .then(details => details.instrument.name)
                    .catch(() => epic); // Fallback to epic on error

                const [accounts, name] = await Promise.all([
                    accountsPromise,
                    marketPromise
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