import type { Account } from '$lib/shared/types/account.js';

export const AccountCmd = {
    SetActive: 0,
    SetAccounts: 1,
    ApplyOptimistic: 2,
} as const;

export type AccountCommand =
    | { tag: typeof AccountCmd.SetActive; account: Account | null }
    | { tag: typeof AccountCmd.SetAccounts; real: Account[]; demo: Account[] }
    | { tag: typeof AccountCmd.ApplyOptimistic; pnl: number };

export const accountCmd = {
    setActive: (account: Account | null): AccountCommand =>
        ({ tag: AccountCmd.SetActive, account }),
    setAccounts: (real: Account[], demo: Account[]): AccountCommand =>
        ({ tag: AccountCmd.SetAccounts, real, demo }),
    applyOptimistic: (pnl: number): AccountCommand =>
        ({ tag: AccountCmd.ApplyOptimistic, pnl }),
};
