import { goto } from '$app/navigation';
import * as STORAGE from '$lib/constants/storage.js';
import * as AUTH from '$lib/constants/auth.js';
import { getPreferences, updatePreferences, getAccounts } from '$lib/services/account.js';
import type { AccountPreferences, LeverageUpdate, LeverageCategory, Account } from '$lib/types/account.js';
import type { SessionTokens } from '$lib/types/auth.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class PreferencesLogic {
    activeType = $state<URL_TYPE>(AUTH.REAL_TYPE);

    isLoading = $state(true);
    isSaving = $state(false);
    error = $state('');
    message = $state('');

    data = $state<AccountPreferences | null>(null);
    currentAccount = $state<Account | null>(null);

    hedging = $state(false);
    leverages = $state<Partial<Record<LeverageCategory, number>>>({});

    async init() {
        await this.load(this.activeType);
    }

    async switchType(type: URL_TYPE) {
        this.activeType = type;
        await this.load(type);
    }

    async load(type: URL_TYPE) {
        this.isLoading = true;
        this.error = '';
        this.message = '';
        this.currentAccount = null; // Reset while loading

        const storageKey = type === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);

        if (!tokensStr) {
            await goto('/login');
            return;
        }

        try {
            const tokens: SessionTokens = JSON.parse(tokensStr);

            // Fetch both preferences and accounts list to find the active one
            const [prefs, accounts] = await Promise.all([
                getPreferences(type, tokens),
                getAccounts(type, tokens)
            ]);

            this.data = prefs;
            this.hedging = prefs.hedgingMode;

            // The API usually marks the active session account as 'preferred'
            this.currentAccount = accounts.find(a => a.preferred) || accounts[0] || null;

            this.leverages = {};
            for (const [key, val] of Object.entries(prefs.leverages)) {
                this.leverages[key as LeverageCategory] = val.current;
            }

        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isLoading = false;
        }
    }

    async save() {
        this.isSaving = true;
        this.error = '';
        this.message = '';

        const storageKey = this.activeType === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensStr = localStorage.getItem(storageKey);

        if (!tokensStr) {
            this.error = "Session expired";
            this.isSaving = false;
            return;
        }

        try {
            const tokens: SessionTokens = JSON.parse(tokensStr);

            const leverageUpdate = { ...this.leverages } as LeverageUpdate;

            const response = await updatePreferences(this.activeType, tokens, leverageUpdate, this.hedging);

            if (response.status === 'SUCCESS') {
                this.message = "Preferences updated successfully";
                await this.load(this.activeType);
            } else {
                this.error = "Update failed: Unknown status";
            }
        } catch (e) {
            this.error = e instanceof Error ? e.message : String(e);
        } finally {
            this.isSaving = false;
        }
    }
}