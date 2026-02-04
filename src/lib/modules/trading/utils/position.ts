import type { PositionBody } from "$lib/shared/types/trading.js";
import type { Account } from "$lib/shared/types/account.js";
import { session } from "$lib/modules/core/services/SessionManager.js";

export function resolveInitialBalance(position: PositionBody, account: Account): number {
    // 1. Try to get specific saved IB for this deal
    const savedIB = session.getInitialBalance(position.dealId);

    if (savedIB !== null) {
        return savedIB;
    }

    // 2. Fallback: strictly use current Deposit as requested and save it for future consistency
    const currentDeposit = account.balance.deposit;
    session.setInitialBalance(position.dealId, currentDeposit);

    return currentDeposit;
}