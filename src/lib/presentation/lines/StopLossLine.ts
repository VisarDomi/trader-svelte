import * as CHART from '$lib/constants/chart.js';
import { TradeCalculator } from '$lib/domain/trade/TradeCalculator.js';
import { LineTitleFormatter } from '$lib/presentation/formatters/LineTitleFormatter.js';
import type { PositionBody } from '$lib/types/trading.js';
import type { IChartLine, LineData } from './types.js';

export class StopLossLine implements IChartLine {
    constructor(
        private readonly position: PositionBody,
        private readonly initialBalance: number,
        private readonly calculator: TradeCalculator,
        private readonly formatter: LineTitleFormatter
    ) {}

    getData(isLandscape: boolean): LineData | null {
        if (!this.position.stopLevel) return null;

        const result = this.calculator.calculatePnL(
            this.position.level,
            this.position.stopLevel,
            this.position.size,
            this.position.direction,
            this.initialBalance
        );

        return {
            price: this.position.stopLevel,
            color: CHART.WENDY_LINE_COLOR,
            title: this.formatter.formatPnL(result, isLandscape, isLandscape ? 'Potential Loss' : '')
        };
    }
}