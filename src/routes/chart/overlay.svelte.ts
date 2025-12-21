import { ApiClient } from '$lib/api/client.js';
import { getSyncedAccounts } from '$lib/services/account.js';
import { getMarketDetails } from '$lib/services/market.js';
import { getPositions } from '$lib/services/trading.js';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import type { Account } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { PositionResponse } from '$lib/types/trading.js';

export class ChartOverlay {
    isOpen = $state(false);
    account = $state<Account | null>(null);
    position = $state<PositionResponse | null>(null);
    loading = $state(false);
    mode = $state<URL_TYPE>(AUTH.DEMO_TYPE);
    marketName = $state('');

    private pollInterval: ReturnType<typeof setInterval> | null = null;

    async init(epic: string) {
        if (typeof window === 'undefined') return;

        this.loading = true;
        this.marketName = epic;

        const storedMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE;
        this.mode = storedMode || AUTH.DEMO_TYPE;

        await this.fetchData(epic);
        this.loading = false;

        this.startPolling(epic);
    }

    destroy() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    private startPolling(epic: string) {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => {
            this.fetchData(epic);
        }, 2000);
    }

    private async fetchData(epic: string) {
        const storageKey = this.mode === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);

        if (!tokensStr) return;

        try {
            const tokens: SessionTokens = JSON.parse(tokensStr);
            const client = new ApiClient(this.mode, tokens);

            const [accounts, positionsList, marketDetails] = await Promise.all([
                getSyncedAccounts(this.mode, tokens, client),
                getPositions(client),
                getMarketDetails(client, epic).catch(() => null)
            ]);

            this.account = accounts.find(a => a.preferred) || accounts[0] || null;

            const foundPos = positionsList.positions.find(p => p.market.epic === epic);
            this.position = foundPos || null;

            if (marketDetails) {
                this.marketName = marketDetails.instrument.name;
            }

        } catch (e) {
            console.error("Overlay sync failed", e);
        }
    }

    toggle() {
        this.isOpen = !this.isOpen;
    }
}