import { goto } from '$app/navigation';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import { getAccounts, switchAccount } from '$lib/services/account.js';
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
                // Default: Trading on Demo
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

            // 1. Fetch current state from Broker
            const [real, demo] = await Promise.all([
                getAccounts(AUTH.REAL_TYPE, realTokens),
                getAccounts(AUTH.DEMO_TYPE, demoTokens)
            ]);

            // 2. Check for Account Mismatches against our LocalStorage preference & Auto-Restore
            const updatedReal = await this.restorePreferredAccount(AUTH.REAL_TYPE, real, realTokens);
            const updatedDemo = await this.restorePreferredAccount(AUTH.DEMO_TYPE, demo, demoTokens);

            this.realAccounts = updatedReal;
            this.demoAccounts = updatedDemo;

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isLoading = false;
        }
    }

    // Helper to check if we are on the wrong account and switch back if necessary
    private async restorePreferredAccount(type: URL_TYPE, accounts: Account[], tokens: SessionTokens): Promise<Account[]> {
        if (typeof window === 'undefined') return accounts;

        const storageKey = type === AUTH.REAL_TYPE ? STORAGE.LAST_REAL_ACCOUNT_ID_KEY : STORAGE.LAST_DEMO_ACCOUNT_ID_KEY;
        const lastUsedId = localStorage.getItem(storageKey);
        const activeAccount = accounts.find(a => a.preferred);

        // ONLY attempt restore if we have an explicit user preference saved
        if (lastUsedId && activeAccount && activeAccount.accountId !== lastUsedId) {
            // Check if the saved ID actually exists in the list (account wasn't deleted)
            const targetAccount = accounts.find(a => a.accountId === lastUsedId);

            if (targetAccount) {
                console.log(`Auto-switching ${type} from ${activeAccount.accountId} to saved ${lastUsedId}`);
                try {
                    // Perform the switch
                    const newTokens = await switchAccount(type, tokens, lastUsedId);

                    // Update tokens in storage
                    const tokenStorageKey = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
                    localStorage.setItem(tokenStorageKey, JSON.stringify(newTokens));

                    // Return the list with flags flipped locally to reflect the switch we just made
                    return accounts.map(a => ({
                        ...a,
                        preferred: a.accountId === lastUsedId
                    }));
                } catch (e) {
                    console.warn(`Failed to auto-restore ${type} account:`, e);
                }
            }
        }

        // If no saved preference exists, or we are already on the correct account, return list as-is.
        // We DO NOT overwrite the LocalStorage key here.
        return accounts;
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

                // CRITICAL: This is the ONLY place we write the user's account preference
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