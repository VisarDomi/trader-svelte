import * as CHART from '$lib/shared/constants/chart.js';
import { TradeCalculator } from '$lib/domains/trading/domain/TradeCalculator.js';
import { LineTitleFormatter } from '$lib/features/chart-drawings/utils/LineTitleFormatter.js';
import type { PositionBody } from '$lib/shared/types/trading.js';
import type { IChartLine, LineData } from '$lib/features/chart-drawings/types';

export class TakeProfitLine implements IChartLine {
    constructor(
        private readonly position: PositionBody,
        private readonly initialBalance: number,
        private readonly calculator: TradeCalculator,
        private readonly formatter: LineTitleFormatter
    ) {}

    getData(isLandscape: boolean): LineData | null {
        if (!this.position.profitLevel) return null;

        const result = this.calculator.calculatePnL(
            this.position.level,
            this.position.profitLevel,
            this.position.size,
            this.position.direction,
            this.initialBalance
        );

        return {
            price: this.position.profitLevel,
            color: CHART.LAMBO_LINE_COLOR,
            title: this.formatter.formatPnL(result, isLandscape, isLandscape ? 'Potential Profit' : '')
        };
    }
}