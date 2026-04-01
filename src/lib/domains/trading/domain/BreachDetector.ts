import * as TRADING from '$lib/shared/constants/trading.js';
import type { PositionBody } from '$lib/shared/types/trading.js';

export function detectBreach(
    bid: number,
    offer: number,
    position: PositionBody
): boolean {
    const isBuy = position.direction === TRADING.BUY_DIRECTION;

    if (isBuy) {
        if (position.stopLevel && bid <= position.stopLevel) return true;
        if (position.profitLevel && bid >= position.profitLevel) return true;
    } else {
        if (position.stopLevel && offer >= position.stopLevel) return true;
        if (position.profitLevel && offer <= position.profitLevel) return true;
    }

    return false;
}
