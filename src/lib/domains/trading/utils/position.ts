import type { PositionBody } from "$lib/shared/types/trading.js";
import type { Account } from "$lib/shared/types/account.js";
import { session } from "$lib/core/services/SessionManager.js";

export function resolveInitialBalance(position: PositionBody, account: Account): number {

    const savedIB = session.getInitialBalance(position.dealId);

    if (savedIB !== null) {
        return savedIB;
    }

    const currentDeposit = account.balance.deposit;
    session.setInitialBalance(position.dealId, currentDeposit);

    return currentDeposit;
}
