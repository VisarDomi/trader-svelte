import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { getAccounts, switchAccount } from '$lib/domains/trading/services/AccountApiService.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';
import { SystemController } from '$lib/core/engine/SystemController.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import type { Account } from '$lib/shared/types/account.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';
import type { ApiClient } from '$lib/core/api/ApiClient.js';
import type { SessionTokens } from '$lib/shared/types/auth.js';

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
        bus.on('trade:executed', () => {
            void this.refreshActive();
        });

        bus.on('position:closed', () => {
            void this.pollBalanceUpdate();
        });
    }

    async init() {
        await this.refreshActive();
    }

    /**
     * Loads accounts and enforces LocalStorage as the source of truth for the active account.
     * This method blocks until the correct account is switched and ready.
     */
    async loadAll() {
        this.isLoading = true;
        this.error = "";

        const realClient = api.getClientForMode(AUTH.REAL_TYPE);
        const demoClient = api.getClientForMode(AUTH.DEMO_TYPE);

        if (!realClient || !demoClient) {
            this.error = "Session incomplete. Please login again.";
            this.isLoading = false;
            return;
        }

        try {
            // 1. Fetch Lists directly (No side effects in service layer)
            const [real, demo] = await Promise.all([
                getAccounts(realClient),
                getAccounts(demoClient)
            ]);

            this.realAccounts = real;
            this.demoAccounts = demo;

            // 2. Reconciliation Phase: Enforce LocalStorage Truth
            await this.reconcileActiveAccount();

            // 3. Final State Update
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
        const client = api.getClientForMode(mode);

        if (!client) return;

        try {
            const list = await getAccounts(client);
            if (mode === AUTH.REAL_TYPE) this.realAccounts = list;
            else this.demoAccounts = list;

            this.updateActiveFromLists();
        } catch (e) {
            console.error("AccountStore refreshActive failed", e);
        }
    }

    /**
     * Checks if the Account marked as 'preferred' by the server matches
     * the Account saved in LocalStorage. If not, it switches immediately.
     */
    private async reconcileActiveAccount() {
        const mode = session.mode;
        const tokens = session.getTokens(mode);
        const storedId = session.getLastAccountId(mode);

        if (!storedId || !tokens) return;

        const list = mode === AUTH.REAL_TYPE ? this.realAccounts : this.demoAccounts;
        const targetAccount = list.find(a => a.accountId === storedId);

        // If we can't find the LS account in the list, we fallback to server default.
        if (!targetAccount) {
            console.warn(`[AccountStore] Saved account ${storedId} not found in fetch list.`);
            return;
        }

        // If the server thinks another account is preferred, we must switch
        if (!targetAccount.preferred) {
            console.log(`[AccountStore] Reconciling: Switching to saved account ${storedId}`);
            try {
                // Perform the switch
                const newTokens = await switchAccount(mode, tokens, storedId);

                // Update Session
                session.saveTokens(mode, newTokens);

                // Update Local State Optimistically
                this.markAsPreferred(mode, storedId);
            } catch (e) {
                console.error("[AccountStore] Reconciliation switch failed", e);
                // We swallow the error here to allow the app to boot with the default account
                notifications.error("Failed to restore last selected account");
            }
        }
    }

    private markAsPreferred(mode: URL_TYPE, accountId: string) {
        const list = mode === AUTH.REAL_TYPE ? this.realAccounts : this.demoAccounts;

        // Reset flags
        list.forEach(a => a.preferred = false);

        // Set new preferred
        const match = list.find(a => a.accountId === accountId);
        if (match) match.preferred = true;

        if (mode === AUTH.REAL_TYPE) this.realAccounts = [...list];
        else this.demoAccounts = [...list];
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

            // Reload to ensure full sync, but we could just reconcile locally
            await this.loadAll();

            notifications.success(`Switched to ${account.accountName}`);

            // STRICT HANDOFF: Restart all pumps to ensure they use the new account tokens
            SystemController.restart();
        });

        if (this.error) notifications.error(this.error);
    }

    updateBalance(amount: number) {
        if (this.activeAccount) {
            this.activeAccount.balance.deposit = amount;
        }
    }

    private async pollBalanceUpdate() {
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.refreshActive();
        }
    }
}

export const accountStore = new AccountStore();