import * as TRADING from '$lib/constants/trading.js';
import { calculatePositionParameters, type TradeCalculationParams, type TradeCalculationResult } from '$lib/utils/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { Direction } from '$lib/types/trading.js';

export interface PlannedTrade extends TradeCalculationResult {
    direction: Direction;
    entryPrice: number;
}

export class TradePlanner {
    calculate(
        market: MarketDetailsResponse,
        accountBalance: number,
        userLeverage: number,
        direction: Direction,
        clickPrice: number
    ): PlannedTrade | null {
        if (accountBalance <= 0) {
            throw new Error("Insufficient funds to plan trade.");
        }

        const params: TradeCalculationParams = {
            accountBalance,
            leverage: userLeverage,
            entryPrice: clickPrice,
            lotSize: market.instrument.lotSize || 1,
            minSizeIncrement: market.dealingRules.minSizeIncrement.value,
            minDealSize: market.dealingRules.minDealSize.value,
            decimalPlaces: market.snapshot.decimalPlacesFactor,
            direction,
            clickPrice,
            stopLossRatio: TRADING.STOP_LOSS_RATIO
        };

        const result = calculatePositionParameters(params);

        if (!result) {
            return null;
        }

        return {
            ...result,
            direction,
            entryPrice: clickPrice
        };
    }
}