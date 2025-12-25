import { BaseStore } from '$lib/core/BaseStore.svelte.js';
import { getSyncedAccounts, switchAccount } from '$lib/services/account.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import * as AUTH from '$lib/constants/auth.js';
import type { Account } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class AccountStore extends BaseStore {
    // Active Context (Used by Chart)
    activeAccount = $state<Account | null>(null);

    // Management Data (Used by Accounts Page)
    realAccounts = $state<Account[]>([]);
    demoAccounts = $state<Account[]>([]);

    get activeSymbol() {
        return this.activeAccount?.symbol || "";
    }

    get balance() {
        return this.activeAccount?.balance.deposit || 0;
    }

    async init() {
        await this.refreshActive();
    }

    async loadAll() {
        // Manually managing loading here because this is a complex multi-client operation
        // that doesn't fit the simple execute() pattern of BaseStore perfectly (needs 2 clients).
        this.isLoading = true;
        this.error = "";

        const realClient = api.getClientForMode(AUTH.REAL_TYPE);
        const demoClient = api.getClientForMode(AUTH.DEMO_TYPE);
        const realTokens = session.getTokens(AUTH.REAL_TYPE);
        const demoTokens = session.getTokens(AUTH.DEMO_TYPE);

        if (!realClient || !demoClient || !realTokens || !demoTokens) {
            this.error = "Session incomplete. Please login again.";
            this.isLoading = false;
            return;
        }

        try {
            const [real, demo] = await Promise.all([
                getSyncedAccounts(AUTH.REAL_TYPE, realTokens, realClient),
                getSyncedAccounts(AUTH.DEMO_TYPE, demoTokens, demoClient)
            ]);

            this.realAccounts = real;
            this.demoAccounts = demo;
            this.updateActiveFromLists();

        } catch (e) {
            console.error("AccountStore loadAll failed", e);
            this.error = "Failed to load accounts";
        } finally {
            this.isLoading = false;
        }
    }

    async refreshActive() {
        const mode = session.mode;
        const tokens = session.getTokens(mode);
        const client = api.getClientForMode(mode);

        if (!tokens || !client) return;

        // Lightweight update, generally doesn't need full loading spinner
        try {
            const list = await getSyncedAccounts(mode, tokens, client);
            if (mode === AUTH.REAL_TYPE) this.realAccounts = list;
            else this.demoAccounts = list;

            this.updateActiveFromLists();
        } catch (e) {
            console.error("AccountStore refreshActive failed", e);
        }
    }

    private updateActiveFromLists() {
        const mode = session.mode;
        const list = mode === AUTH.REAL_TYPE ? this.realAccounts : this.demoAccounts;
        this.activeAccount = list.find(a => a.preferred) || list[0] || null;
    }

    async switchTo(account: Account, type: URL_TYPE) {
        await this.execute(async () => {
            const tokens = session.getTokens(type);
            if (!tokens) throw new Error("No session tokens found");

            if (!account.preferred) {
                const newTokens = await switchAccount(type, tokens, account.accountId);
                session.saveTokens(type, newTokens);
                session.setLastAccountId(type, account.accountId);
            }

            session.mode = type;
            await this.loadAll();
            notifications.success(`Switched to ${account.accountName}`);
        });

        if (this.error) notifications.error(this.error);
    }

    updateBalance(amount: number) {
        if (this.activeAccount) {
            this.activeAccount.balance.deposit = amount;
        }
    }
}

export const accountStore = new AccountStore();