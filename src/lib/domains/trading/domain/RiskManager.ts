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
        const targetLoss = balance * TRADING.STOP_LOSS_RATIO;
        const lotSize = market.instrument.lotSize;
        const decimalPlaces = market.snapshot.decimalPlacesFactor;
        const tickSize = 1 / Math.pow(10, decimalPlaces);
        const isBuy = position.direction === TRADING.BUY_DIRECTION;
        const entryPrice = position.level;

        // 1. Calculate theoretical limit
        const exactDist = targetLoss / (position.size * lotSize);
        const limitPrice = isBuy
            ? entryPrice - exactDist
            : entryPrice + exactDist;

        // 2. Identify candidates
        const floorTick = Math.floor(limitPrice / tickSize) * tickSize;
        const ceilTick = Math.ceil(limitPrice / tickSize) * tickSize;

        const candidates = [floorTick, ceilTick];

        // 3. Pick optimal safe tick
        // We want loss <= targetLoss, maximized

        let bestPrice = floorTick;
        let bestLossVal = -1;
        const EPSILON = 0.01;

        for (const cand of candidates) {
            const p = roundPrice(cand, decimalPlaces);
            const dist = Math.abs(p - entryPrice);
            const loss = dist * position.size * lotSize;

            if (loss <= (targetLoss + EPSILON)) {
                if (loss > bestLossVal) {
                    bestLossVal = loss;
                    bestPrice = p;
                }
            }
        }

        return bestPrice;
    }
}