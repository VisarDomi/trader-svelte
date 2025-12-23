import type { TradeCalculator } from '$lib/domain/trade/TradeCalculator.js';
import type { LineTitleFormatter } from '$lib/presentation/formatters/LineTitleFormatter.js';
import type { PositionBody } from '$lib/types/trading.js';
import type { LineData } from './types.js';

const PROFIT_COLOR = "#22958a";
const LOSS_COLOR = "#bf4240";

/**
 * Pure function to calculate current price line data.
 * Replaces the Class implementation to reduce object allocation in the hot render loop.
 */
export function calculateCurrentPriceLine(
    position: PositionBody,
    currentPrice: number,
    initialBalance: number,
    calculator: TradeCalculator,
    formatter: LineTitleFormatter,
    isLandscape: boolean
): LineData {
    const result = calculator.calculatePnL(
        position.level,
        currentPrice,
        position.size,
        position.direction,
        initialBalance
    );

    const isProfit = result.rawPnL >= 0;

    return {
        price: currentPrice,
        color: isProfit ? PROFIT_COLOR : LOSS_COLOR,
        title: formatter.formatPnL(result, isLandscape)
    };
}