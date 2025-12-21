import { goto } from '$app/navigation';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import { ApiClient } from '$lib/api/client.js';
import { getSyncedAccounts, switchAccount } from '$lib/services/account.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import type { Account } from '$lib/types/account.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class Accounts {
    realAccounts = $state<Account[]>([]);
    demoAccounts = $state<Account[]>([]);
    isLoading = $state(true);
    error = $state('');
    tradingMode = $state<URL_TYPE>(AUTH.DEMO_TYPE);

    async init() {
        this.isLoading = true;
        this.error = '';
        if (typeof window !== 'undefined') {
            this.tradingMode = session.mode;
        }
        await this.loadData();
    }

    private async loadData() {
        const realTokens = session.getTokens(AUTH.REAL_TYPE);
        const demoTokens = session.getTokens(AUTH.DEMO_TYPE);

        if (!realTokens || !demoTokens) {
            await goto('/login');
            return;
        }
        try {
            const realClient = new ApiClient(AUTH.REAL_TYPE, realTokens);
            const demoClient = new ApiClient(AUTH.DEMO_TYPE, demoTokens);

            const [real, demo] = await Promise.all([
                getSyncedAccounts(AUTH.REAL_TYPE, realTokens, realClient),
                getSyncedAccounts(AUTH.DEMO_TYPE, demoTokens, demoClient)
            ]);

            this.realAccounts = real;
            this.demoAccounts = demo;

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
            notifications.error("Failed to load accounts");
        } finally {
            this.isLoading = false;
        }
    }

    async switchTo(account: Account, type: URL_TYPE) {
        this.isLoading = true;
        this.error = '';

        const tokens = session.getTokens(type);
        if (!tokens) {
            notifications.error("No session tokens found");
            this.isLoading = false;
            return;
        }

        try {
            if (!account.preferred) {
                const newTokens = await switchAccount(type, tokens, account.accountId);
                session.saveTokens(type, newTokens);
                session.setLastAccountId(type, account.accountId);
            }

            session.mode = type;
            this.tradingMode = type;

            await this.loadData();
            notifications.success(`Switched to ${account.accountName}`);

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.error = msg;
            notifications.error(msg);
            this.isLoading = false;
        }
    }
}