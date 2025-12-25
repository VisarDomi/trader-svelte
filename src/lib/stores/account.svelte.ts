import { BaseStore } from '$lib/core/BaseStore.svelte.js';
import { getSyncedAccounts, switchAccount } from '$lib/services/account.js';
import { api } from '$lib/services/api.svelte.js';
import { session } from '$lib/services/session.js';
import { notifications } from '$lib/services/notifications.svelte.js';
import { bus } from '$lib/stores/bus.js'; // NEW
import * as AUTH from '$lib/constants/auth.js';
import type { Account } from '$lib/types/account.js';
import type { URL_TYPE } from '$lib/types/url.js';

export class AccountStore extends BaseStore {
    activeAccount = $state<Account | null>(null);
    realAccounts = $state<Account[]>([]);
    demoAccounts = $state<Account[]>([]);

    get activeSymbol() {
        return this.activeAccount?.symbol || "";
    }

    get balance() {
        return this.activeAccount?.balance.deposit || 0;
    }

    constructor() {
        super();
        // Listen for trade execution to update balance instantly (optimistic)
        // or trigger a refresh.
        bus.on('trade:executed', () => {
            // Note: The trade itself might reduce "available" immediately,
            // but "deposit" changes only on close.
            // We refresh just in case.
            void this.refreshActive();
        });

        // Listen for position close to update realized PnL/Deposit
        bus.on('position:closed', () => {
            void this.pollBalanceUpdate();
        });
    }

    async init() {
        await this.refreshActive();
    }

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

    // Moved polling logic here from PositionStore where it semantically belongs
    private async pollBalanceUpdate() {
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.refreshActive();
        }
    }
}

export const accountStore = new AccountStore();