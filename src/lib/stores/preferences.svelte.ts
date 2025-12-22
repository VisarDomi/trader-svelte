import { getPreferences, updatePreferences, getSyncedAccounts } from '$lib/services/account.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import * as AUTH from '$lib/constants/auth.js';
import type { Account, AccountPreferences, LeverageCategory, LeverageUpdate } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class PreferencesStore {
    // Data
    account = $state<Account | null>(null);
    data = $state<AccountPreferences | null>(null);

    // UI State (Staging)
    leverages = $state<Partial<Record<LeverageCategory, number>>>({});
    activeType = $state<URL_TYPE>(AUTH.REAL_TYPE);

    // Status
    isLoading = $state(false);
    isSaving = $state(false);
    error = $state("");

    async init(type: URL_TYPE) {
        this.activeType = type;
        this.isLoading = true;
        this.error = "";
        this.account = null;

        const client = api.getClientForMode(type);
        const tokens = session.getTokens(type);

        if (!client || !tokens) {
            this.error = "Session invalid";
            this.isLoading = false;
            return;
        }

        try {
            const [prefs, accounts] = await Promise.all([
                getPreferences(client),
                getSyncedAccounts(type, tokens, client)
            ]);

            this.data = prefs;

            // Determine which account we are editing
            const storedId = session.getLastAccountId(type);
            this.account = accounts.find(a => a.accountId === storedId)
                || accounts.find(a => a.preferred)
                || accounts[0]
                || null;

            // Hydrate staging state
            this.leverages = {};
            for (const [key, val] of Object.entries(prefs.leverages)) {
                this.leverages[key as LeverageCategory] = val.current;
            }

        } catch (e) {
            console.error("Preferences load failed", e);
            this.error = "Failed to load preferences";
        } finally {
            this.isLoading = false;
        }
    }

    setLeverage(category: string, value: number) {
        this.leverages[category as LeverageCategory] = value;
    }

    async save() {
        this.isSaving = true;
        this.error = "";

        const tokens = session.getTokens(this.activeType);
        if (!tokens) {
            notifications.error("Session expired");
            this.isSaving = false;
            return;
        }

        try {
            const leverageUpdate = { ...this.leverages } as LeverageUpdate;

            // We force hedging to false per business requirement
            const response = await updatePreferences(
                this.activeType,
                tokens,
                leverageUpdate,
                false
            );

            if (response.status === 'SUCCESS') {
                notifications.success("Preferences updated successfully");
                // Reload to confirm application
                await this.init(this.activeType);
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

export const preferencesStore = new PreferencesStore();