import { BaseStore } from '$lib/core/BaseStore.svelte.js';
import { getPreferences, updatePreferences, getSyncedAccounts, topUpAccount } from '$lib/services/account.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import * as AUTH from '$lib/constants/auth.js';
import type { Account, AccountPreferences, LeverageCategory, LeverageUpdate } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class PreferencesStore extends BaseStore {
    account = $state<Account | null>(null);
    data = $state<AccountPreferences | null>(null);
    leverages = $state<Partial<Record<LeverageCategory, number>>>({});
    activeType = $state<URL_TYPE>(AUTH.REAL_TYPE);

    // isSaving specific to preferences logic (separate from general isLoading)
    isSaving = $state(false);

    async init(type: URL_TYPE) {
        this.activeType = type;

        // We get client specific to the type requested, not just the global active one
        const client = api.getClientForMode(type);
        const tokens = session.getTokens(type);

        if (!client || !tokens) {
            this.error = "Session invalid";
            return;
        }

        await this.execute(async () => {
            const [prefs, accounts] = await Promise.all([
                getPreferences(client),
                getSyncedAccounts(type, tokens, client)
            ]);

            this.data = prefs;

            const storedId = session.getLastAccountId(type);
            this.account = accounts.find(a => a.accountId === storedId)
                || accounts.find(a => a.preferred)
                || accounts[0]
                || null;

            this.leverages = {};
            for (const [key, val] of Object.entries(prefs.leverages)) {
                this.leverages[key as LeverageCategory] = val.current;
            }
        });
    }

    setLeverage(category: string, value: number) {
        this.leverages[category as LeverageCategory] = value;
    }

    async save() {
        this.isSaving = true;
        this.error = "";

        try {
            const tokens = session.getTokens(this.activeType);
            if (!tokens) throw new Error("Session expired");

            const leverageUpdate = { ...this.leverages } as LeverageUpdate;

            const response = await updatePreferences(
                this.activeType,
                tokens,
                leverageUpdate,
                false
            );

            if (response.status !== 'SUCCESS') {
                throw new Error("Update failed: Unknown status");
            }

            notifications.success("Preferences updated successfully");
            await this.init(this.activeType);

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.error = msg;
            notifications.error(msg);
        } finally {
            this.isSaving = false;
        }
    }

    async resetDemoBalance() {
        if (this.activeType !== AUTH.DEMO_TYPE) return;
        if (!this.account) return;

        this.isSaving = true;

        try {
            const currentBalance = this.account.balance.deposit;
            const target = 1000;
            const delta = target - currentBalance;
            const amount = Math.round(delta * 100) / 100;

            if (Math.abs(amount) < 0.01) {
                notifications.info("Balance already at $1000");
                return;
            }

            const client = api.getClientForMode(this.activeType);
            if (!client) throw new Error("Session invalid");

            await topUpAccount(client, amount);
            notifications.success("Account reset to $1000");
            await this.init(this.activeType);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            notifications.error(msg);
        } finally {
            this.isSaving = false;
        }
    }
}

export const preferencesStore = new PreferencesStore();