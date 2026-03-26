import { BaseStore } from '$lib/core/stores/BaseStore.svelte.js';
import { getAccounts, switchAccount } from '$lib/domains/trading/services/AccountApiService.js';
import { api } from '$lib/core/services/ApiService.svelte.js';
import { session } from '$lib/core/services/SessionManager.js';
import { notifications } from '$lib/core/services/NotificationService.svelte.js';
import { bus } from '$lib/core/events/globalBus.js';
import { SystemController } from '$lib/core/engine/SystemController.js';
import { AccountCmd, type AccountCommand } from './AccountCommands.js';
import { accountCmd } from './AccountCommands.js';
import * as AUTH from '$lib/shared/constants/auth.js';
import * as EVENTS from '$lib/shared/constants/events.js';
import type { Account } from '$lib/shared/types/account.js';
import type { URL_TYPE } from '$lib/shared/types/url.js';
import type { SessionTokens } from '$lib/shared/types/auth.js';
import { log } from '$lib/shared/utils/log.js';

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

        bus.on(EVENTS.POSITION_CLOSED, ({ pnl }) => {
            this.dispatch(accountCmd.applyOptimistic(pnl));
            void this.pollBalanceUpdate();
        });

        bus.on(EVENTS.POSITION_VANISHED, () => {
            void this.refreshActive();
        });
    }

    dispatch(cmd: AccountCommand) {
        switch (cmd.tag) {
            case AccountCmd.SetActive:
                this.activeAccount = cmd.account;
                break;
            case AccountCmd.SetAccounts:
                this.realAccounts = cmd.real;
                this.demoAccounts = cmd.demo;
                break;
            case AccountCmd.ApplyOptimistic:
                this.applyOptimisticUpdate(cmd.pnl);
                break;
        }
    }

    async init() {
        await this.refreshActive();
    }

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
            const [real, demo] = await Promise.all([
                getAccounts(realClient),
                getAccounts(demoClient)
            ]);

            this.realAccounts = real;
            this.demoAccounts = demo;

            await this.resolveSourceOfTruth();

        } catch (e) {
            log.error("AccountStore loadAll failed", e);
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

            const storedId = session.getLastAccountId(mode);
            if (storedId) {
                this.setActiveById(storedId);
            } else if (!this.activeAccount && list.length > 0) {

                const fallback = list.find(a => a.preferred) || list[0];
                this.activeAccount = fallback;
                session.setLastAccountId(mode, fallback.accountId);
            }

            if (this.activeAccount && !this.activeAccount.preferred) {
                await this.enforceServerSwitch(this.activeAccount, mode);
            }
        } catch (e) {
            log.error("AccountStore refreshActive failed", e);
        }
    }

    private async resolveSourceOfTruth() {
        const mode = session.mode;
        const list = mode === AUTH.REAL_TYPE ? this.realAccounts : this.demoAccounts;

        if (list.length === 0) {
            this.error = "No accounts available.";
            return;
        }

        let targetId = session.getLastAccountId(mode);
        let targetAccount = targetId ? list.find(a => a.accountId === targetId) : null;

        if (!targetAccount) {
            targetAccount = list.find(a => a.preferred) || list[0];
            if (targetAccount) {
                session.setLastAccountId(mode, targetAccount.accountId);
                targetId = targetAccount.accountId;
            }
        }

        if (targetAccount) {
            this.activeAccount = targetAccount;
            if (!targetAccount.preferred) {
                try {
                    await this.enforceServerSwitch(targetAccount, mode);
                } catch (e) {
                    log.error("[AccountStore] Background switch failed", e);
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
        session.saveTokens(mode, newTokens);
        this.updateLocalFlags(mode, account.accountId);
    }

    private updateLocalFlags(mode: URL_TYPE, activeId: string) {
        const list = mode === AUTH.REAL_TYPE ? this.realAccounts : this.demoAccounts;
        const newList = list.map(a => ({
            ...a,
            preferred: a.accountId === activeId
        }));

        if (mode === AUTH.REAL_TYPE) this.realAccounts = newList;
        else this.demoAccounts = newList;

        this.activeAccount = newList.find(a => a.accountId === activeId) || null;
    }

    async switchTo(account: Account, type: URL_TYPE) {
        await this.execute(async () => {
            const tokens = session.getTokens(type);
            if (!tokens) throw new Error("No session tokens found");

            session.setLastAccountId(type, account.accountId);
            session.mode = type;

            if (!account.preferred) {
                const newTokens = await switchAccount(type, tokens, account.accountId);
                session.saveTokens(type, newTokens);
            }

            await this.loadAll();
            notifications.success(`Switched to ${account.accountName}`);
            SystemController.restart();
        });

        if (this.error) notifications.error(this.error);
    }

    private applyOptimisticUpdate(pnl: number) {
        if (!this.activeAccount) return;

        this.activeAccount.balance.deposit += pnl;

        this.activeAccount.balance.profitLoss = 0;

        this.activeAccount.balance.available = this.activeAccount.balance.deposit;

        log.info(`[AccountStore] Optimistic Update applied. New Deposit: ${this.activeAccount.balance.deposit}`);
    }

    private async pollBalanceUpdate() {

        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.refreshActive();
        }
    }
}

export const accountStore = new AccountStore();
