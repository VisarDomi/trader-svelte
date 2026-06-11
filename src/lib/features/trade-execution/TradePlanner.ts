import * as TRADING from '$lib/shared/constants/trading.js';
import { roundDownToStep, roundPrice } from '$lib/shared/utils/math.js';
import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
import type { Direction } from '$lib/shared/types/trading.js';
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';

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
        const t0 = performance.now();
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

        const elapsed = Math.round(performance.now() - t0);
        serverLog({ tag: LogEvent.TradePlan, timingMs: elapsed });

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

        const rawSize = (balance * TRADING.MARGIN_BUFFER_RATIO * leverage) / (lotSize * price);
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

        const targetLoss = balance * TRADING.STOP_LOSS_RATIO;
        const tickSize = 1 / Math.pow(10, decimalPlaces);
        const isBuy = direction === TRADING.BUY_DIRECTION;

        const exactDist = targetLoss / (size * lotSize);

        const limitPrice = isBuy
            ? entryPrice - exactDist
            : entryPrice + exactDist;

        const floorTick = Math.floor(limitPrice / tickSize) * tickSize;
        const ceilTick = Math.ceil(limitPrice / tickSize) * tickSize;

        const candidates = [floorTick, ceilTick];

        let bestPrice = floorTick;
        let bestLossVal = -1;

        const EPSILON = 0.01;

        for (const cand of candidates) {

            const p = roundPrice(cand, decimalPlaces);

            const dist = Math.abs(p - entryPrice);
            const loss = dist * size * lotSize;

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
