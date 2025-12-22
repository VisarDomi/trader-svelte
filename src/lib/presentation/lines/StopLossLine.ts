import * as CHART from '$lib/constants/chart.js';
import * as TRADING from '$lib/constants/trading.js';
import { roundDownToFactor } from '$lib/utils/trading.js';
import type { PositionBody } from '$lib/types/trading.js';
import type { IChartLine, LineData } from './types.js';

export class StopLossLine implements IChartLine {
    constructor(
        private readonly position: PositionBody,
        private readonly initialBalance: number,
        private readonly currencySymbol: string
    ) {}

    getData(isLandscape: boolean): LineData | null {
        if (!this.position.stopLevel) return null;

        return {
            price: this.position.stopLevel,
            color: CHART.WENDY_LINE_COLOR,
            title: isLandscape ? this.getLandscapeTitle() : this.getPortraitTitle()
        };
    }

    private getLandscapeTitle(): string {
        const lossAmount = this.calculatePotentialLoss();
        const formattedLoss = this.formatCurrency(lossAmount);

        if (this.initialBalance === 0) {
            return `Loss -${formattedLoss}`;
        }

        const remainingBalance = this.initialBalance - lossAmount;
        const lossPercentage = (lossAmount / this.initialBalance) * 100;
        const recoveryText = this.getRecoveryText(lossPercentage);

        return `Potential Loss -${formattedLoss} (${this.formatCurrency(remainingBalance)}) (-${lossPercentage.toFixed(2)}%)${recoveryText}`;
    }

    private getPortraitTitle(): string {
        if (this.initialBalance === 0) {
            const lossAmount = this.calculatePotentialLoss();
            return `-${this.formatCurrency(lossAmount)}`;
        }

        const lossAmount = this.calculatePotentialLoss();
        const lossPercentage = (lossAmount / this.initialBalance) * 100;
        const recoveryText = this.getRecoveryText(lossPercentage);

        return `-${lossPercentage.toFixed(2)}%${recoveryText}`;
    }

    private calculatePotentialLoss(): number {
        const diff = Math.abs(this.position.level - (this.position.stopLevel ?? 0));
        const rawLoss = diff * this.position.size;
        return roundDownToFactor(rawLoss, TRADING.ACCOUNT_USD_PRICE_PRECISION);
    }

    private getRecoveryText(lossPercentage: number): string {
        if (lossPercentage >= 100) return '';

        const recoveryPercentage = (lossPercentage / (100 - lossPercentage)) * 100;
        return ` (-+${recoveryPercentage.toFixed(2)}%)`;
    }

    private formatCurrency(value: number): string {
        return `${this.currencySymbol}${value.toFixed(2)}`;
    }
}