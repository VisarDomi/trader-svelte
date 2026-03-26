import type { TradeCalculator } from '$lib/domains/trading/domain/TradeCalculator.js';
import type { LineTitleFormatter } from '$lib/features/chart-drawings/utils/LineTitleFormatter.js';
import type { PositionBody } from '$lib/shared/types/trading.js';
import type { LineData } from '$lib/features/chart-drawings/types';

const PROFIT_COLOR = "#22958a";
const LOSS_COLOR = "#bf4240";

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
