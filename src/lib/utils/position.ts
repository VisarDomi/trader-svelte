import type { PositionBody } from "$lib/types/trading.js";
import type { Account } from "$lib/types/account.js";

export function resolveInitialBalance(position: PositionBody, account: Account): number {
    if (typeof localStorage === 'undefined') return account.balance.deposit;

    const storageKey = `IB_${position.dealId}`;
    const savedIB = localStorage.getItem(storageKey);

    if (savedIB) {
        return parseFloat(savedIB);
    }

    // Fallback: strictly use Deposit as requested
    const currentDeposit = account.balance.deposit;
    localStorage.setItem(storageKey, currentDeposit.toString());

    return currentDeposit;
}