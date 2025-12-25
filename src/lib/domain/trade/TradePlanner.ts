import * as TRADING from '$lib/constants/trading.js';
import { roundDownToStep, roundPrice } from '$lib/utils/math.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { Direction } from '$lib/types/trading.js';

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
        const allowedLossAmount = balance * TRADING.STOP_LOSS_RATIO;
        const priceDistance = allowedLossAmount / (size * lotSize);

        const unroundedStopPrice = direction === TRADING.BUY_DIRECTION
            ? entryPrice - priceDistance
            : entryPrice + priceDistance;

        return roundPrice(unroundedStopPrice, decimalPlaces);
    }
}