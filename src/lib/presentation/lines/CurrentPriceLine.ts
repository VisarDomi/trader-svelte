import * as TRADING from '$lib/constants/trading.js';
import { roundDownToFactor } from '$lib/utils/trading.js';
import type { PositionBody } from '$lib/types/trading.js';
import type { IChartLine, LineData } from './types.js';

export class CurrentPriceLine implements IChartLine {
    private readonly PROFIT_COLOR = "#22958a";
    private readonly LOSS_COLOR = "#bf4240";

    constructor(
        private readonly position: PositionBody,
        private readonly currentPrice: number,
        private readonly initialBalance: number,
        private readonly currencySymbol: string
    ) {}

    getData(isLandscape: boolean): LineData {
        const pnl = this.calculatePnL();
        const isProfit = pnl >= 0;

        return {
            price: this.currentPrice,
            color: isProfit ? this.PROFIT_COLOR : this.LOSS_COLOR,
            title: isLandscape ? this.getLandscapeTitle(pnl) : this.getPortraitTitle(pnl)
        };
    }

    private getLandscapeTitle(pnl: number): string {
        const absPnL = Math.abs(pnl);
        const sign = pnl >= 0 ? '+' : '-';
        const formattedPnL = `${sign}${this.formatCurrency(absPnL)}`;

        if (this.initialBalance === 0) {
            return formattedPnL;
        }

        const currentBalance = this.initialBalance + pnl;
        const percentage = (pnl / this.initialBalance) * 100;
        const offsetText = this.getOffsetText(percentage);

        return `${formattedPnL} (${this.formatCurrency(currentBalance)}) (${sign}${Math.abs(percentage).toFixed(2)}%)${offsetText}`;
    }

    private getPortraitTitle(pnl: number): string {
        if (this.initialBalance === 0) {
            const absPnL = Math.abs(pnl);
            const sign = pnl >= 0 ? '+' : '-';
            return `${sign}${this.formatCurrency(absPnL)}`;
        }

        const percentage = (pnl / this.initialBalance) * 100;
        const sign = pnl >= 0 ? '+' : '-';
        const offsetText = this.getOffsetText(percentage);

        return `${sign}${Math.abs(percentage).toFixed(2)}%${offsetText}`;
    }

    private calculatePnL(): number {
        let rawPnL: number;
        if (this.position.direction === TRADING.BUY_DIRECTION) {
            rawPnL = (this.currentPrice - this.position.level) * this.position.size;
        } else {
            rawPnL = (this.position.level - this.currentPrice) * this.position.size;
        }
        return roundDownToFactor(rawPnL, TRADING.ACCOUNT_USD_PRICE_PRECISION);
    }

    private getOffsetText(percentage: number): string {
        if (percentage >= 0) {
            const giveBack = (percentage / (100 + percentage)) * 100;
            return ` (+-${giveBack.toFixed(2)}%)`;
        } else {
            const absPercentage = Math.abs(percentage);
            if (absPercentage >= 100) return '';
            const recovery = (absPercentage / (100 - absPercentage)) * 100;
            return ` (-+${recovery.toFixed(2)}%)`;
        }
    }

    private formatCurrency(value: number): string {
        return `${this.currencySymbol}${value.toFixed(2)}`;
    }
}