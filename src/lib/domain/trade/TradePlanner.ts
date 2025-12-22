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

        // 1. Extract Rules
        const lotSize = market.instrument.lotSize || 1;
        const minSizeIncrement = market.dealingRules.minSizeIncrement.value;
        const minDealSize = market.dealingRules.minDealSize.value;
        const decimalPlaces = market.snapshot.decimalPlacesFactor;

        // 2. Calculate Position Size
        // Formula: (Balance * Leverage) / (LotSize * Price)
        const rawSize = (accountBalance * userLeverage) / (lotSize * entryPrice);
        const size = roundDownToStep(rawSize, minSizeIncrement);

        if (size < minDealSize) {
            return null;
        }

        // 3. Calculate Stop Loss distance based on Risk Ratio (Constants)
        // We strictly adhere to a Stop Loss Ratio defined in constants
        const stopLossRatio = TRADING.STOP_LOSS_RATIO;

        // Margin Required for this size
        const marginRequired = (size * lotSize * entryPrice) / userLeverage;

        // Allowed Loss Amount
        const lossAmount = accountBalance * stopLossRatio;

        // Price Distance = LossAmount / (Size * LotSize)
        const priceDiff = lossAmount / (size * lotSize);

        let unroundedStopPrice: number;
        if (direction === TRADING.BUY_DIRECTION) {
            unroundedStopPrice = entryPrice - priceDiff;
        } else {
            unroundedStopPrice = entryPrice + priceDiff;
        }

        const stopLevel = roundPrice(unroundedStopPrice, decimalPlaces);

        // 4. Set Profit Level to the User's Target Price (Click location)
        const profitLevel = roundPrice(targetPrice, decimalPlaces);

        return {
            size,
            stopLevel,
            profitLevel,
            marginRequired,
            potentialLoss: lossAmount,
            direction,
            entryPrice
        };
    }
}