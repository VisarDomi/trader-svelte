import { roundPrice } from '$lib/utils/math.js';
import type { PositionBody } from '$lib/types/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import * as TRADING from '$lib/constants/trading.js';

export class RiskManager {
    /**
     * Checks if the current position's stop loss exceeds the safety ratio (50%) of the balance.
     * Returns the corrected stop level if a violation is detected, otherwise null.
     */
    calculateCorrection(
        position: PositionBody,
        market: MarketDetailsResponse,
        balance: number
    ): number | null {
        // If no stop level is set, we can't evaluate risk ratio (it's theoretically infinite or undefined).
        // If guaranteedStop is false, we should probably check if one is required, but here we only modify existing ones.
        if (!position.stopLevel) return null;

        const lotSize = market.instrument.lotSize;
        const entry = position.level;
        const sl = position.stopLevel;
        const size = position.size;
        const direction = position.direction;

        // 1. Calculate Current Risk Amount
        // Loss = |Entry - SL| * Size * LotSize
        const priceDist = Math.abs(entry - sl);
        const riskAmount = priceDist * size * lotSize;

        if (balance <= 0) return null; // Edge case

        const riskRatio = riskAmount / balance;

        // 2. Check Threshold (50%)
        // We use a small epsilon (0.001) to avoid correcting rounding noise
        // that keeps us barely at 50%.
        if (riskRatio <= TRADING.STOP_LOSS_RATIO + 0.001) {
            return null;
        }

        // 3. Calculate New SL Distance
        // Target Risk = Balance * 0.5
        const targetRisk = balance * TRADING.STOP_LOSS_RATIO;

        // Dist = Risk / (Size * Lot)
        const newDist = targetRisk / (size * lotSize);

        // 4. Calculate New SL Level
        let newSL: number;
        if (direction === TRADING.BUY_DIRECTION) {
            newSL = entry - newDist;
        } else {
            newSL = entry + newDist;
        }

        // 5. Rounding
        const decimalPlaces = market.snapshot.decimalPlacesFactor;
        const roundedSL = roundPrice(newSL, decimalPlaces);

        return roundedSL;
    }
}