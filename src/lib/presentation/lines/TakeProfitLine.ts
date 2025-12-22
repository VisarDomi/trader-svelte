import * as CHART from '$lib/constants/chart.js';
import * as TRADING from '$lib/constants/trading.js';
import { roundDownToFactor } from '$lib/utils/trading.js';
import type { PositionBody } from '$lib/types/trading.js';
import type { IChartLine, LineData } from './types.js';

export class TakeProfitLine implements IChartLine {
    constructor(
        private readonly position: PositionBody,
        private readonly initialBalance: number,
        private readonly currencySymbol: string
    ) {}

    getData(isLandscape: boolean): LineData | null {
        if (!this.position.profitLevel) return null;

        return {
            price: this.position.profitLevel,
            color: CHART.LAMBO_LINE_COLOR,
            title: isLandscape ? this.getLandscapeTitle() : this.getPortraitTitle()
        };
    }

    private getLandscapeTitle(): string {
        const profitAmount = this.calculatePotentialProfit();
        const formattedProfit = this.formatCurrency(profitAmount);

        if (this.initialBalance === 0) {
            return `Profit +${formattedProfit}`;
        }

        const projectedBalance = this.initialBalance + profitAmount;
        const profitPercentage = (profitAmount / this.initialBalance) * 100;
        const giveBackText = this.getGiveBackText(profitPercentage);

        return `Potential Profit +${formattedProfit} (${this.formatCurrency(projectedBalance)}) (+${profitPercentage.toFixed(2)}%) (+-${giveBackText})`;
    }

    private getPortraitTitle(): string {
        if (this.initialBalance === 0) {
            const profitAmount = this.calculatePotentialProfit();
            return `+${this.formatCurrency(profitAmount)}`;
        }

        const profitAmount = this.calculatePotentialProfit();
        const profitPercentage = (profitAmount / this.initialBalance) * 100;
        const giveBackText = this.getGiveBackText(profitPercentage);

        return `+${profitPercentage.toFixed(2)}% (+-${giveBackText})`;
    }

    private calculatePotentialProfit(): number {
        const diff = Math.abs(this.position.level - (this.position.profitLevel ?? 0));
        const rawProfit = diff * this.position.size;
        return roundDownToFactor(rawProfit, TRADING.ACCOUNT_USD_PRICE_PRECISION);
    }

    private getGiveBackText(profitPercentage: number): string {
        const giveBackPercentage = (profitPercentage / (100 + profitPercentage)) * 100;
        return giveBackPercentage.toFixed(2) + '%';
    }

    private formatCurrency(value: number): string {
        return `${this.currencySymbol}${value.toFixed(2)}`;
    }
}