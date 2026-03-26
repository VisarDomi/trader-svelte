import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { getPreferences, updatePreferences, getAccounts, topUpAccount } from '$lib/domains/trading/services/AccountApiService.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import type { Account, AccountPreferences, LeverageCategory, LeverageUpdate } from '$lib/shared/types/account.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';

export class PreferencesStore extends BaseStore {
    account = $state<Account | null>(null);
    data = $state<AccountPreferences | null>(null);
    leverages = $state<Partial<Record<LeverageCategory, number>>>({});
    activeType = $state<URL_TYPE>(AUTH.REAL_TYPE);

    isSaving = $state(false);

    async init(type: URL_TYPE) {
        this.activeType = type;

        const client = api.getClientForMode(type);
        const tokens = session.getTokens(type);

        if (!client || !tokens) {
            this.error = "Session invalid";
            return;
        }

        await this.execute(async () => {
            const [prefs, accounts] = await Promise.all([
                getPreferences(client),
                getAccounts(client)
            ]);

            this.data = prefs;

            let storedId = session.getLastAccountId(type);
            let active = storedId ? accounts.find(a => a.accountId === storedId) : null;

            if (!active) {
                active = accounts.find(a => a.preferred) || accounts[0];
                if (active) {
                    session.setLastAccountId(type, active.accountId);
                    storedId = active.accountId;
                }
            }

            this.account = active || null;

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
