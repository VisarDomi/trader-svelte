import * as TRADING from '$lib/shared/constants/trading.js';
import { roundDownToFactor } from '$lib/shared/utils/math.js';
import type { Direction } from '$lib/shared/types/trading.js';

export interface PnLResult {
    rawPnL: number;
    percentage: number;
    offsetPercentage: number;
    projectedBalance: number;
}

export class TradeCalculator {
    calculatePnL(
        entryPrice: number,
        currentPrice: number,
        size: number,
        direction: Direction,
        initialBalance: number
    ): PnLResult {
        const isBuy = direction === TRADING.BUY_DIRECTION;
        const priceDiff = isBuy ? currentPrice - entryPrice : entryPrice - currentPrice;

        const rawPnL = priceDiff * size;
        const roundedPnL = roundDownToFactor(rawPnL, TRADING.ACCOUNT_USD_PRICE_PRECISION);

        // Handle edge case where balance is 0 to avoid division by zero
        if (initialBalance === 0) {
            return {
                rawPnL: roundedPnL,
                percentage: 0,
                offsetPercentage: 0,
                projectedBalance: 0
            };
        }

        const percentage = (roundedPnL / initialBalance) * 100;
        const projectedBalance = initialBalance + roundedPnL;
        const offsetPercentage = this.calculateOffset(percentage);

        return {
            rawPnL: roundedPnL,
            percentage,
            offsetPercentage,
            projectedBalance
        };
    }

    private calculateOffset(percentage: number): number {
        if (percentage >= 0) {
            // Give Back: How much of the NEW total is this profit?
            // Formula: x / (100 + x)
            return (percentage / (100 + percentage)) * 100;
        } else {
            // Recovery: How much gain is needed on the REMAINING balance to get back?
            // Formula: |x| / (100 - |x|)
            const absPercentage = Math.abs(percentage);
            if (absPercentage >= 100) return 0; // Total loss
            return (absPercentage / (100 - absPercentage)) * 100;
        }
    }
}