import { roundPrice } from '$lib/shared/utils/math.js';
import * as TRADING from '$lib/shared/constants/trading.js';
import type { PositionBody } from '$lib/shared/types/trading.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';

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
        if (!position.stopLevel || balance <= 0) return null;

        const currentRiskRatio = this.calculateRiskRatio(position, market, balance);
        const toleranceEpsilon = 0.001;

        if (currentRiskRatio <= TRADING.STOP_LOSS_RATIO + toleranceEpsilon) {
            return null;
        }

        return this.calculateSafeStopLevel(position, market, balance);
    }

    private calculateRiskRatio(
        position: PositionBody,
        market: MarketDetailsResponse,
        balance: number
    ): number {
        const priceDistance = Math.abs(position.level - (position.stopLevel || position.level));
        const lotSize = market.instrument.lotSize;
        const riskAmount = priceDistance * position.size * lotSize;

        return riskAmount / balance;
    }

    private calculateSafeStopLevel(
        position: PositionBody,
        market: MarketDetailsResponse,
        balance: number
    ): number {
        const targetRiskAmount = balance * TRADING.STOP_LOSS_RATIO;
        const lotSize = market.instrument.lotSize;

        const safePriceDistance = targetRiskAmount / (position.size * lotSize);

        const newStopPrice = position.direction === TRADING.BUY_DIRECTION
            ? position.level - safePriceDistance
            : position.level + safePriceDistance;

        const decimalPlaces = market.snapshot.decimalPlacesFactor;
        return roundPrice(newStopPrice, decimalPlaces);
    }
}