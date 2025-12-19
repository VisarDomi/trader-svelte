import { goto } from '$app/navigation';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import { getSyncedAccounts, switchAccount } from '$lib/services/account.js';
import type { Account } from '$lib/types/account.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class Accounts {
    realAccounts = $state<Account[]>([]);
    demoAccounts = $state<Account[]>([]);
    isLoading = $state(true);
    error = $state('');
    toastMessage = $state('');
    tradingMode = $state<URL_TYPE>(AUTH.DEMO_TYPE);

    async init() {
        this.isLoading = true;
        this.error = '';
        if (typeof window !== 'undefined') {
            const storedMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE;
            if (storedMode) {
                this.tradingMode = storedMode;
            } else {
                this.tradingMode = AUTH.DEMO_TYPE;
                localStorage.setItem(STORAGE.TRADING_MODE_KEY, AUTH.DEMO_TYPE);
            }
        }
        await this.loadData();
    }

    private async loadData() {
        const realTokensStr = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        const demoTokensStr = localStorage.getItem(STORAGE.TOKENS_DEMO_KEY);
        if (!realTokensStr || !demoTokensStr) {
            await goto('/login');
            return;
        }
        try {
            const realTokens: SessionTokens = JSON.parse(realTokensStr);
            const demoTokens: SessionTokens = JSON.parse(demoTokensStr);

            const [real, demo] = await Promise.all([
                getSyncedAccounts(AUTH.REAL_TYPE, realTokens),
                getSyncedAccounts(AUTH.DEMO_TYPE, demoTokens)
            ]);

            this.realAccounts = real;
            this.demoAccounts = demo;

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isLoading = false;
        }
    }

    async switchTo(account: Account, type: URL_TYPE) {
        this.isLoading = true;
        this.error = '';
        const storageKey = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);
        if (!tokensStr) {
            this.error = "No session tokens found.";
            this.isLoading = false;
            return;
        }
        try {
            if (!account.preferred) {
                const currentTokens: SessionTokens = JSON.parse(tokensStr);
                const newTokens = await switchAccount(type, currentTokens, account.accountId);
                localStorage.setItem(storageKey, JSON.stringify(newTokens));

                const lastIdKey = type === AUTH.REAL_TYPE ? STORAGE.LAST_REAL_ACCOUNT_ID_KEY : STORAGE.LAST_DEMO_ACCOUNT_ID_KEY;
                localStorage.setItem(lastIdKey, account.accountId);
            }

            this.tradingMode = type;
            localStorage.setItem(STORAGE.TRADING_MODE_KEY, type);

            await this.loadData();

            this.toastMessage = `Switched to ${account.accountName}`;
            setTimeout(() => {
                this.toastMessage = '';
            }, 3000);

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
            this.isLoading = false;
        }
    }
}