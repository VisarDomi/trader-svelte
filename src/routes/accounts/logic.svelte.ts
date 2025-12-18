import { goto } from '$app/navigation';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import { getAccounts } from '$lib/services/account';
import type { Account } from '$lib/types/account';
import type { SessionTokens } from '$lib/types/auth';

export class AccountsLogic {
    realAccounts = $state<Account[]>([]);
    demoAccounts = $state<Account[]>([]);
    isLoading = $state(true);
    error = $state('');

    async init() {
        this.isLoading = true;
        this.error = '';

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
                getAccounts(AUTH.REAL_TYPE, realTokens),
                getAccounts(AUTH.DEMO_TYPE, demoTokens)
            ]);

            this.realAccounts = real;
            this.demoAccounts = demo;
        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isLoading = false;
        }
    }
}