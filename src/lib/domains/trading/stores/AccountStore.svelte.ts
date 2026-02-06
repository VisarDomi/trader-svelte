import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { getAccounts, switchAccount } from '$lib/domains/trading/services/AccountApiService.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';
import { SystemController } from '$lib/core/engine/SystemController.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import type { Account } from '$lib/shared/types/account.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';
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
        bus.on(EVENTS.TRADE_EXECUTED, () => {
            void this.refreshActive();
        });

        bus.on(EVENTS.POSITION_CLOSED, () => {
            void this.pollBalanceUpdate();
        });
    }

    async init() {
        await this.refreshActive();
    }

    /**
     * Loads accounts and enforces LocalStorage as the absolute Source of Truth.
     *
     * Logic Flow:
     * 1. Fetch Lists.
     * 2. Check LocalStorage for ID.
     * 3. If LS has ID -> Use it.
     * 4. If LS empty -> Pick Server Default -> Save to LS immediately.
     * 5. Set activeAccount based on this resolved ID.
     * 6. If Server disagrees with our choice, force Server to switch in background.
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

            // 2. Resolve Truth for Current Mode
            await this.resolveSourceOfTruth();

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

            // Re-apply the stored ID to ensure the active object is up to date
            const storedId = session.getLastAccountId(mode);
            if (storedId) {
                this.setActiveById(storedId);
            }
        } catch (e) {
            console.error("AccountStore refreshActive failed", e);
        }
    }

    /**
     * The Core Decision Maker.
     * Determines which account is active based on LS priority.
     */
    private async resolveSourceOfTruth() {
        const mode = session.mode;
        const list = mode === AUTH.REAL_TYPE ? this.realAccounts : this.demoAccounts;

        if (list.length === 0) {
            this.error = "No accounts available.";
            return;
        }

        // 1. Check LocalStorage (The Truth)
        let targetId = session.getLastAccountId(mode);
        let targetAccount = targetId ? list.find(a => a.accountId === targetId) : null;

        // 2. If Truth is missing (Fresh App) or Invalid (Account Deleted)
        if (!targetAccount) {
            if (targetId) {
                console.warn(`[AccountStore] Stored ID ${targetId} not found in list. Resetting truth.`);
            }

            // Fallback: Use server preferred, or first available
            targetAccount = list.find(a => a.preferred) || list[0];

            if (targetAccount) {
                // ESTABLISH NEW TRUTH
                console.log(`[AccountStore] Establishing new default account: ${targetAccount.accountId}`);
                session.setLastAccountId(mode, targetAccount.accountId);
                targetId = targetAccount.accountId;
            }
        }

        // 3. Set Active State (UI is now correct)
        if (targetAccount) {
            this.activeAccount = targetAccount;

            // 4. Background Sync
            // If the server thinks a different account is active, we force switch it
            // to match our LocalStorage truth.
            if (!targetAccount.preferred) {
                console.log(`[AccountStore] Syncing server to local truth: ${targetAccount.accountId}`);
                try {
                    await this.enforceServerSwitch(targetAccount, mode);
                } catch (e) {
                    // Non-fatal: UI is correct, but trading might fail if backend is strict.
                    console.error("[AccountStore] Background switch failed", e);
                }
            }
        }
    }

    private setActiveById(id: string) {
        const mode = session.mode;
        const list = mode === AUTH.REAL_TYPE ? this.realAccounts : this.demoAccounts;
        this.activeAccount = list.find(a => a.accountId === id) || null;
    }

    private async enforceServerSwitch(account: Account, mode: URL_TYPE) {
        const tokens = session.getTokens(mode);
        if (!tokens) return;

        const newTokens = await switchAccount(mode, tokens, account.accountId);

        // Update Session Tokens
        session.saveTokens(mode, newTokens);

        // Update Local List 'preferred' flags optimistically
        this.updateLocalFlags(mode, account.accountId);
    }

    private updateLocalFlags(mode: URL_TYPE, activeId: string) {
        const list = mode === AUTH.REAL_TYPE ? this.realAccounts : this.demoAccounts;

        // Create new array references for Svelte reactivity
        const newList = list.map(a => ({
            ...a,
            preferred: a.accountId === activeId
        }));

        if (mode === AUTH.REAL_TYPE) this.realAccounts = newList;
        else this.demoAccounts = newList;

        // Re-bind active account to the new object reference
        this.activeAccount = newList.find(a => a.accountId === activeId) || null;
    }

    /**
     * User Action: Explicit Switch
     */
    async switchTo(account: Account, type: URL_TYPE) {
        await this.execute(async () => {
            const tokens = session.getTokens(type);
            if (!tokens) throw new Error("No session tokens found");

            // 1. Establish Truth Immediately
            session.setLastAccountId(type, account.accountId);
            session.mode = type;

            // 2. Perform API Switch if needed
            if (!account.preferred) {
                const newTokens = await switchAccount(type, tokens, account.accountId);
                session.saveTokens(type, newTokens);
            }

            // 3. Reload everything to conform to new Truth
            await this.loadAll();

            notifications.success(`Switched to ${account.accountName}`);

            // STRICT HANDOFF: Restart all pumps
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