import type { PnLResult } from '$lib/domains/trading/domain/TradeCalculator.js';

export class LineTitleFormatter {
    constructor(private currencySymbol: string) {}

    formatPnL(result: PnLResult, isLandscape: boolean, label: string = ''): string {
        return isLandscape
            ? this.getLandscapeTitle(result, label)
            : this.getPortraitTitle(result);
    }

    private getLandscapeTitle(result: PnLResult, label: string): string {
        const sign = result.rawPnL >= 0 ? '+' : '-';
        const absPnL = Math.abs(result.rawPnL).toFixed(2);
        const pnlMoney = `${sign}${this.currencySymbol}${absPnL}`;

        // If no balance context, just return money value
        if (result.projectedBalance === 0 && result.percentage === 0) {
            return `${label} ${pnlMoney}`.trim();
        }

        const balanceMoney = `${this.currencySymbol}${result.projectedBalance.toFixed(2)}`;
        const percent = `${sign}${Math.abs(result.percentage).toFixed(2)}%`;
        const offset = this.formatOffset(result.offsetPercentage, result.rawPnL >= 0);

        return `${label} ${pnlMoney} (${balanceMoney}) (${percent})${offset}`.trim();
    }

    private getPortraitTitle(result: PnLResult): string {
        if (result.projectedBalance === 0 && result.percentage === 0) {
            const sign = result.rawPnL >= 0 ? '+' : '-';
            return `${sign}${this.currencySymbol}${Math.abs(result.rawPnL).toFixed(2)}`;
        }

        const sign = result.rawPnL >= 0 ? '+' : '-';
        const percent = `${sign}${Math.abs(result.percentage).toFixed(2)}%`;
        const offset = this.formatOffset(result.offsetPercentage, result.rawPnL >= 0);

        return `${percent}${offset}`;
    }

    private formatOffset(offset: number, isProfit: boolean): string {
        if (offset === 0) return '';

        // (+- 2.00%) for profit giveback
        // (-+ 2.00%) for loss recovery
        const prefix = isProfit ? '+-' : '-+';
        return ` (${prefix}${offset.toFixed(2)}%)`;
    }
}