import { goto } from '$app/navigation';
import * as AUTH from '$lib/constants/auth.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { getPreferences, updatePreferences, getAccounts } from '$lib/services/account.js';
import type { AccountPreferences, LeverageUpdate, LeverageCategory, Account } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class PreferencesLogic {
    activeType = $state<URL_TYPE>(AUTH.REAL_TYPE);
    isLoading = $state(true);
    isSaving = $state(false);
    error = $state('');

    // UI Data
    data = $state<AccountPreferences | null>(null);
    currentAccount = $state<Account | null>(null);
    hedging = $state(false);
    leverages = $state<Partial<Record<LeverageCategory, number>>>({});

    async init() {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const type = params.get('type') as URL_TYPE | null;
            if (type === AUTH.REAL_TYPE || type === AUTH.DEMO_TYPE) {
                this.activeType = type;
            }
        }
        await this.load(this.activeType);
    }

    async load(type: URL_TYPE) {
        this.isLoading = true;
        this.error = '';
        this.currentAccount = null;

        const client = session.getClient(type);
        if (!client) {
            await goto('/login');
            return;
        }

        try {
            const [prefs, accounts] = await Promise.all([
                getPreferences(client),
                getAccounts(client)
            ]);
            this.data = prefs;

            // Force local hedging state to false regardless of API response
            this.hedging = false;

            // Resolve which account was last used for this environment
            const storedId = session.getLastAccountId(type);
            const explicitAccount = accounts.find(a => a.accountId === storedId);

            this.currentAccount = explicitAccount || accounts.find(a => a.preferred) || accounts[0] || null;

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

        const tokens = session.getTokens(this.activeType);
        if (!tokens) {
            notifications.error("Session expired");
            this.isSaving = false;
            return;
        }

        try {
            const leverageUpdate = { ...this.leverages } as LeverageUpdate;

            // Force hedgingMode to false
            const response = await updatePreferences(this.activeType, tokens, leverageUpdate, false);

            if (response.status === 'SUCCESS') {
                notifications.success("Preferences updated successfully");
                await this.load(this.activeType);
            } else {
                throw new Error("Update failed: Unknown status");
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.error = msg;
            notifications.error(msg);
        } finally {
            this.isSaving = false;
        }
    }
}