import { getSyncedAccounts, switchAccount } from '$lib/services/account.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import * as AUTH from '$lib/constants/auth.js';
import type { Account } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class AccountStore {
    // Active Context (Used by Chart)
    activeAccount = $state<Account | null>(null);

    // Management Data (Used by Accounts Page)
    realAccounts = $state<Account[]>([]);
    demoAccounts = $state<Account[]>([]);

    isLoading = $state(false);
    error = $state("");

    get activeSymbol() {
        return this.activeAccount?.symbol || "";
    }

    get balance() {
        return this.activeAccount?.balance.deposit || 0;
    }

    get available() {
        return this.activeAccount?.balance.available || 0;
    }

    /**
     * initializes the store based on the CURRENT active session mode.
     * Primarily for the Chart view to get the active trading account.
     */
    async init() {
        await this.refreshActive();
    }

    /**
     * Loads ALL accounts (Real and Demo) for the management page.
     */
    async loadAll() {
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

            // Also update the active account reference based on current mode
            this.updateActiveFromLists();

        } catch (e) {
            console.error("AccountStore loadAll failed", e);
            this.error = "Failed to load accounts";
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Refreshes only the active mode's accounts (lighter weight).
     */
    async refreshActive() {
        const mode = session.mode;
        const tokens = session.getTokens(mode);
        const client = api.getClientForMode(mode);

        if (!tokens || !client) return;

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

    /**
     * Switches the active account in the backend and updates local session.
     */
    async switchTo(account: Account, type: URL_TYPE) {
        this.isLoading = true;
        this.error = "";

        const tokens = session.getTokens(type);
        if (!tokens) {
            notifications.error("No session tokens found");
            this.isLoading = false;
            return;
        }

        try {
            // If it's not the backend's "preferred" account, tell backend to switch
            if (!account.preferred) {
                const newTokens = await switchAccount(type, tokens, account.accountId);
                session.saveTokens(type, newTokens);
                session.setLastAccountId(type, account.accountId);
            }

            // Update App Mode
            session.mode = type;

            // Reload to reflect changes
            await this.loadAll();

            notifications.success(`Switched to ${account.accountName}`);

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.error = msg;
            notifications.error(msg);
        } finally {
            this.isLoading = false;
        }
    }

    updateBalance(amount: number) {
        if (this.activeAccount) {
            this.activeAccount.balance.deposit = amount;
            this.activeAccount.balance.available = amount;
        }
    }
}

export const accountStore = new AccountStore();