import { getSyncedAccounts } from '$lib/services/account.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import type { Account } from '$lib/types/account.js';

export class AccountStore {
    // State
    accounts = $state<Account[]>([]);
    activeAccount = $state<Account | null>(null);
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

    async init() {
        await this.refresh();
    }

    async refresh() {
        this.isLoading = true;
        this.error = "";

        const mode = session.mode;
        const tokens = session.getTokens(mode);
        const client = api.client;

        if (!tokens || !client) {
            this.isLoading = false;
            return; // Logic upstream handles redirect to login
        }

        try {
            const list = await getSyncedAccounts(mode, tokens, client);
            this.accounts = list;

            // Logic to determine active account (Preferred -> First -> Null)
            this.activeAccount = list.find(a => a.preferred) || list[0] || null;
        } catch (e) {
            console.error("AccountStore load failed", e);
            this.error = "Failed to load accounts";
        } finally {
            this.isLoading = false;
        }
    }

    // Helper to manually set balance after a trade without waiting for full refresh
    updateBalance(amount: number) {
        if (this.activeAccount) {
            // We update specific fields to keep reactivity granular if needed
            this.activeAccount.balance.deposit = amount;
            this.activeAccount.balance.available = amount; // simplified assumption
        }
    }
}

export const accountStore = new AccountStore();