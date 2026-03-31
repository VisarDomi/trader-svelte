import * as TRADING from '$lib/shared/constants/trading.js';
import type { PositionBody } from '$lib/shared/types/trading.js';

/**
 * Pure function: given a price and position, detects if SL or TP has been breached.
 * Owns no state, mutates nothing — just reads price truth and position levels.
 *
 * For BUY positions: SL breached when bid <= stopLevel, TP breached when bid >= profitLevel
 * For SELL positions: SL breached when offer >= stopLevel, TP breached when offer <= profitLevel
 */
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
