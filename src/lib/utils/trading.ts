import { BUY_DIRECTION } from "$lib/constants/trading.js";
import type { Direction } from "$lib/types/trading.js";

export function roundDownToFactor(value: number, factor: number): number {
    return Math.floor(value * factor) / factor;
}

export function roundDownToStep(value: number, step: number): number {
    if (step === 0) return value;
    const inv = 1.0 / step;
    return Math.floor(value * inv) / inv;
}

export function roundPrice(value: number, decimalPlaces: number): number {
    const factor = Math.pow(10, decimalPlaces);
    return Math.round(value * factor) / factor;
}

export interface TradeCalculationParams {
    accountBalance: number;
    leverage: number;
    entryPrice: number;
    lotSize: number;
    minSizeIncrement: number;
    minDealSize: number;
    decimalPlaces: number;
    direction: Direction;
    clickPrice: number;
    stopLossRatio: number;
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

    const rawSize = (accountBalance * leverage) / (lotSize * entryPrice);
    const size = roundDownToStep(rawSize, minSizeIncrement);

    if (size < minDealSize) {
        return null;
    }

    const marginRequired = (size * lotSize * entryPrice) / leverage;
    const lossAmount = accountBalance * stopLossRatio;
    const priceDiff = lossAmount / (size * lotSize);

    let unroundedStopPrice: number;
    if (direction === BUY_DIRECTION) {
        unroundedStopPrice = entryPrice - priceDiff;
    } else {
        unroundedStopPrice = entryPrice + priceDiff;
    }

    const stopLevel = roundPrice(unroundedStopPrice, decimalPlaces);
    const profitLevel = roundPrice(clickPrice, decimalPlaces);

    return {
        size,
        stopLevel,
        profitLevel,
        marginRequired,
        potentialLoss: lossAmount
    };
}