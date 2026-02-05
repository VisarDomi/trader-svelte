import * as TRADING from '$lib/shared/constants/trading.js';
import { roundDownToStep, roundPrice } from '$lib/shared/utils/math.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
import type { Direction } from '$lib/shared/types/trading.js';

export interface PlannedTrade {
    size: number;
    stopLevel: number;
    profitLevel: number;
    marginRequired: number;
    potentialLoss: number;
    direction: Direction;
    entryPrice: number;
}

export class TradePlanner {
    calculate(
        market: MarketDetailsResponse,
        accountBalance: number,
        userLeverage: number,
        direction: Direction,
        entryPrice: number,
        targetPrice: number
    ): PlannedTrade | null {
        if (accountBalance <= 0) {
            throw new Error("Insufficient funds to plan trade.");
        }

        if (userLeverage < 1 || entryPrice <= 0) {
            return null;
        }

        const size = this.calculatePositionSize(
            market,
            accountBalance,
            userLeverage,
            entryPrice
        );

        if (!size) return null;

        const lotSize = market.instrument.lotSize || 1;
        const decimalPlaces = market.snapshot.decimalPlacesFactor;

        const stopLevel = this.calculateRiskBasedStopLevel(
            entryPrice,
            direction,
            size,
            lotSize,
            accountBalance,
            decimalPlaces
        );

        const profitLevel = roundPrice(targetPrice, decimalPlaces);

        const marginRequired = (size * lotSize * entryPrice) / userLeverage;
        const potentialLoss = accountBalance * TRADING.STOP_LOSS_RATIO;

        return {
            size,
            stopLevel,
            profitLevel,
            marginRequired,
            potentialLoss,
            direction,
            entryPrice
        };
    }

    private calculatePositionSize(
        market: MarketDetailsResponse,
        balance: number,
        leverage: number,
        price: number
    ): number | null {
        const lotSize = market.instrument.lotSize || 1;
        const rules = market.dealingRules;

        const rawSize = (balance * leverage) / (lotSize * price);
        const steppedSize = roundDownToStep(rawSize, rules.minSizeIncrement.value);

        const cappedSize = Math.min(steppedSize, rules.maxDealSize.value);

        if (cappedSize < rules.minDealSize.value) {
            return null;
        }

        return cappedSize;
    }

    private calculateRiskBasedStopLevel(
        entryPrice: number,
        direction: Direction,
        size: number,
        lotSize: number,
        balance: number,
        decimalPlaces: number
    ): number {
        // Target: strictly <= 50%
        const targetLoss = balance * TRADING.STOP_LOSS_RATIO;
        const tickSize = 1 / Math.pow(10, decimalPlaces);
        const isBuy = direction === TRADING.BUY_DIRECTION;

        // 1. Calculate the exact price distance allowed
        const exactDist = targetLoss / (size * lotSize);

        // 2. Calculate the theoretical limit price
        const limitPrice = isBuy
            ? entryPrice - exactDist
            : entryPrice + exactDist;

        // 3. Find the two surrounding ticks
        const floorTick = Math.floor(limitPrice / tickSize) * tickSize;
        const ceilTick = Math.ceil(limitPrice / tickSize) * tickSize;

        const candidates = [floorTick, ceilTick];

        // 4. Select the best tick
        // Criteria: Must result in loss <= targetLoss (plus tiny epsilon)
        // AND be closest to targetLoss

        let bestPrice = floorTick;
        let bestLossVal = -1;

        // Epsilon for float comparison safety
        const EPSILON = 0.01; // 1 cent tolerance

        for (const cand of candidates) {
            // Normalize float artifacts
            const p = roundPrice(cand, decimalPlaces);

            // Calc loss for this candidate
            const dist = Math.abs(p - entryPrice);
            const loss = dist * size * lotSize;

            // Check safety
            if (loss <= (targetLoss + EPSILON)) {
                // Check if this is closer to max allowed loss (highest loss is best, as long as it's safe)
                if (loss > bestLossVal) {
                    bestLossVal = loss;
                    bestPrice = p;
                }
            }
        }

        return bestPrice;
    }
}