import { TradeCalculator } from '$lib/domain/trade/TradeCalculator.js';
import { LineTitleFormatter } from '$lib/presentation/formatters/LineTitleFormatter.js';
import type { PositionBody } from '$lib/types/trading.js';
import type { IChartLine, LineData } from './types.js';

export class CurrentPriceLine implements IChartLine {
    private readonly PROFIT_COLOR = "#22958a";
    private readonly LOSS_COLOR = "#bf4240";

    private calculator = new TradeCalculator();
    private formatter: LineTitleFormatter;

    constructor(
        private readonly position: PositionBody,
        private readonly currentPrice: number,
        private readonly initialBalance: number,
        currencySymbol: string
    ) {
        this.formatter = new LineTitleFormatter(currencySymbol);
    }

    getData(isLandscape: boolean): LineData {
        const result = this.calculator.calculatePnL(
            this.position.level,
            this.currentPrice,
            this.position.size,
            this.position.direction,
            this.initialBalance
        );

        const isProfit = result.rawPnL >= 0;

        return {
            price: this.currentPrice,
            color: isProfit ? this.PROFIT_COLOR : this.LOSS_COLOR,
            title: this.formatter.formatPnL(result, isLandscape)
        };
    }
}