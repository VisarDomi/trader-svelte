import { ApiClient } from '$lib/api/client.js';
import { getSyncedAccounts } from '$lib/services/account.js';
import { getMarketDetails } from '$lib/services/market.js';
import { getPositions, createPosition } from '$lib/services/trading.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import * as TRADING from '$lib/constants/trading.js';
import type { Account } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { PositionResponse } from '$lib/types/trading.js';

export class ChartOverlay {
    isOpen = $state(false);
    account = $state<Account | null>(null);
    position = $state<PositionResponse | null>(null);
    loading = $state(false);
    isClosing = $state(false);
    mode = $state<URL_TYPE>(AUTH.DEMO_TYPE);
    marketName = $state('');

    // Callback now accepts the fresh account
    private onPositionClosed: ((account: Account | null) => void) | null = null;

    async init(epic: string, onPositionClosed?: (account: Account | null) => void) {
        if (typeof window === 'undefined') return;

        this.onPositionClosed = onPositionClosed || null;
        this.loading = true;
        this.marketName = epic;

        const storedMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE;
        this.mode = storedMode || AUTH.DEMO_TYPE;

        await this.fetchData(epic);
        this.loading = false;
    }

    destroy() {
        this.onPositionClosed = null;
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

    async closePosition() {
        if (!this.position) return;

        this.isClosing = true;
        const storageKey = this.mode === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);

        if (!tokensStr) {
            notifications.error("Session expired");
            this.isClosing = false;
            return;
        }

        try {
            const tokens: SessionTokens = JSON.parse(tokensStr);
            const client = new ApiClient(this.mode, tokens);

            const currentDir = this.position.position.direction;
            const oppositeDir = currentDir === TRADING.BUY_DIRECTION ? TRADING.SELL_DIRECTION : TRADING.BUY_DIRECTION;

            await createPosition(client, {
                epic: this.position.market.epic,
                direction: oppositeDir,
                size: this.position.position.size
            });

            notifications.success("Position closed");

            // Refresh local data to get updated balance
            await this.fetchData(this.position.market.epic);

            // Notify ChartLogic and pass the updated account
            if (this.onPositionClosed) {
                this.onPositionClosed(this.account);
            }

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
        } finally {
            this.isClosing = false;
        }
    }
}