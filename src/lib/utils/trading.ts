import { BUY_DIRECTION } from "$lib/constants/trading.js";
import type { Direction } from "$lib/types/trading.js";

/**
 * Rounds a number down to a specific step/precision.
 * Example: 0.1234, step 0.1 -> 0.1
 */
export function roundDownToStep(value: number, step: number): number {
    if (step === 0) return value;
    const inv = 1.0 / step;
    return Math.floor(value * inv) / inv;
}

/**
 * Rounds a price to the market's decimal precision.
 */
export function roundPrice(value: number, decimalPlaces: number): number {
    const factor = Math.pow(10, decimalPlaces);
    return Math.round(value * factor) / factor;
}

export interface TradeCalculationParams {
    accountBalance: number; // Available Cash
    leverage: number;       // e.g., 20
    entryPrice: number;
    lotSize: number;        // e.g., 1
    minSizeIncrement: number; // e.g., 0.1
    minDealSize: number;      // e.g., 1
    decimalPlaces: number;    // e.g., 2
    direction: Direction;
    clickPrice: number;       // Target TP
    stopLossRatio: number;    // e.g., 0.5 (50%)
}

export interface TradeCalculationResult {
    size: number;
    stopLevel: number;
    profitLevel: number;
    marginRequired: number;
    potentialLoss: number;
}

export function calculatePositionParameters(params: TradeCalculationParams): TradeCalculationResult | null {
    const {
        accountBalance,
        leverage,
        entryPrice,
        lotSize,
        minSizeIncrement,
        minDealSize,
        decimalPlaces,
        direction,
        clickPrice,
        stopLossRatio
    } = params;

    if (leverage < 1 || entryPrice <= 0) return null;

    // 1. Calculate Max Size (Full Port)
    // Formula: Margin = (Size * LotSize * Price) / Leverage
    // Thus: Size = (Margin * Leverage) / (LotSize * Price)
    const rawSize = (accountBalance * leverage) / (lotSize * entryPrice);

    // 2. Apply Constraints
    const size = roundDownToStep(rawSize, minSizeIncrement);

    if (size < minDealSize) {
        return null; // Insufficient funds for minimum trade
    }

    const marginRequired = (size * lotSize * entryPrice) / leverage;

    // 3. Calculate Stop Loss Price
    // Loss = (Entry - Stop) * Size * LotSize (for BUY)
    // LossAmount = AccountBalance * Ratio
    // Diff = LossAmount / (Size * LotSize)
    const lossAmount = accountBalance * stopLossRatio;
    const priceDiff = lossAmount / (size * lotSize);

    let unroundedStopPrice: number;
    if (direction === BUY_DIRECTION) {
        unroundedStopPrice = entryPrice - priceDiff;
    } else {
        unroundedStopPrice = entryPrice + priceDiff;
    }

    const stopLevel = roundPrice(unroundedStopPrice, decimalPlaces);

    // 4. Take Profit (The Click Price)
    // We strictly use the click price, assuming the user clicked "far enough"
    const profitLevel = roundPrice(clickPrice, decimalPlaces);

    return {
        size,
        stopLevel,
        profitLevel,
        marginRequired,
        potentialLoss: lossAmount
    };
}