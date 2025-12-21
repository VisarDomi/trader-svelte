import { DateTime } from 'luxon';
import * as TRADING from '$lib/constants/trading.js';
import { roundDownToFactor } from '$lib/utils/trading.js';
import { formatTimestampToLocalTime } from '$lib/utils/time.js';
import type { PositionBody } from '$lib/types/trading.js';

export interface LineInfo {
    level: number;
    title: string;
}

export interface CurrentLineInfo extends LineInfo {
    isProfit: boolean;
    profitOrLoss: number;
}

function formatCurrency(val: number, symbol: string): string {
    return `${symbol}${val.toFixed(2)}`;
}

export function generateStartingLine(p: PositionBody, epic: string, isLandscape: boolean): LineInfo {
    let title;

    // Time formatting
    let tradeTime;
    if (p.createdDateUTC) {
        const dateSeconds = DateTime.fromISO(p.createdDateUTC, { zone: "utc" }).toSeconds();
        tradeTime = formatTimestampToLocalTime(dateSeconds as any);
    }

    if (isLandscape) {
        const directionText = p.direction === "BUY" ? "You bought" : "You sold";
        title = `${directionText} ${p.size} ${epic}`;
        if (tradeTime) title += ` at ${tradeTime}`;
    } else {
        // Portrait: 5@14:30
        title = `${p.size}@${tradeTime}`;
    }

    return { level: p.level, title };
}

export function generateWendyLine(p: PositionBody, initialBalance: number, accountSymbol: string, isLandscape: boolean): LineInfo | null {
    if (!p.stopLevel) return null;

    const potentialLoss = Math.abs(p.level - p.stopLevel) * p.size;
    const roundedPotentialLoss = roundDownToFactor(potentialLoss, TRADING.ACCOUNT_USD_PRICE_PRECISION);

    let title;

    if (initialBalance !== 0) {
        const pessimisticBalance = initialBalance - potentialLoss;
        const potentialLossPercentage = (potentialLoss / initialBalance) * 100;
        let offsetPercentageText = "";

        if (potentialLossPercentage < 100) {
            const offsetPercentage = (potentialLossPercentage / (100 - potentialLossPercentage)) * 100;
            offsetPercentageText = ` (-+${offsetPercentage.toFixed(2)}%)`;
        }

        if (isLandscape) {
            title = `Potential Loss -${formatCurrency(roundedPotentialLoss, accountSymbol)} (${formatCurrency(pessimisticBalance, accountSymbol)}) (-${potentialLossPercentage.toFixed(2)}%)${offsetPercentageText}`;
        } else {
            // Portrait: Only Percentage + Offset (Matching Current Line style)
            title = `-${potentialLossPercentage.toFixed(2)}%${offsetPercentageText}`;
        }
    } else {
        title = `Loss -${formatCurrency(roundedPotentialLoss, accountSymbol)}`;
    }

    return { level: p.stopLevel, title };
}

export function generateLamboLine(p: PositionBody, initialBalance: number, accountSymbol: string, isLandscape: boolean): LineInfo | null {
    if (!p.profitLevel) return null;

    const potentialProfit = Math.abs(p.level - p.profitLevel) * p.size;
    const roundedPotentialProfit = roundDownToFactor(potentialProfit, TRADING.ACCOUNT_USD_PRICE_PRECISION);

    let title;

    if (initialBalance !== 0) {
        const optimisticBalance = initialBalance + potentialProfit;
        const potentialProfitPercentage = (potentialProfit / initialBalance) * 100;
        const offsetProfitPercentage = (potentialProfitPercentage / (100 + potentialProfitPercentage)) * 100;

        if (isLandscape) {
            title = `Potential Profit +${formatCurrency(roundedPotentialProfit, accountSymbol)} (${formatCurrency(optimisticBalance, accountSymbol)}) (+${potentialProfitPercentage.toFixed(2)}%) (+-${offsetProfitPercentage.toFixed(2)}%)`;
        } else {
            // Portrait: Only Percentage + Offset
            title = `+${potentialProfitPercentage.toFixed(2)}% (+-${offsetProfitPercentage.toFixed(2)}%)`;
        }
    } else {
        title = `Profit +${formatCurrency(roundedPotentialProfit, accountSymbol)}`;
    }

    return { level: p.profitLevel, title };
}

export function generateCurrentLine(p: PositionBody, currentPrice: number, initialBalance: number, accountSymbol: string, isLandscape: boolean): CurrentLineInfo {
    let profitOrLoss: number;
    if (p.direction === TRADING.BUY_DIRECTION) {
        profitOrLoss = (currentPrice - p.level) * p.size;
    } else {
        profitOrLoss = (p.level - currentPrice) * p.size;
    }

    const PLUS = "+";
    const MINUS = "-";
    const profitOrLossSign = profitOrLoss >= 0 ? PLUS : MINUS;
    const absVal = Math.abs(profitOrLoss);
    const profitOrLossRounded = roundDownToFactor(absVal, TRADING.ACCOUNT_USD_PRICE_PRECISION);

    let title;

    if (initialBalance !== 0) {
        const currentBalance = initialBalance + profitOrLoss;
        const percentage = (profitOrLoss / initialBalance) * 100;
        const percentageRounded = Math.abs(percentage).toFixed(2);

        let offsetPercentageText = "";
        if (percentage >= 0) {
            const offsetPercentage = (percentage / (100 + percentage)) * 100;
            offsetPercentageText = ` (+-${offsetPercentage.toFixed(2)}%)`;
        } else {
            const absPercentage = Math.abs(percentage);
            if (absPercentage < 100) {
                const offsetPercentage = (absPercentage / (100 - absPercentage)) * 100;
                offsetPercentageText = ` (-+${offsetPercentage.toFixed(2)}%)`;
            }
        }

        if (isLandscape) {
            const pnlFormatted = `${profitOrLossSign}${formatCurrency(profitOrLossRounded, accountSymbol)}`;
            title = `${pnlFormatted} (${formatCurrency(currentBalance, accountSymbol)}) (${profitOrLossSign}${percentageRounded}%)${offsetPercentageText}`;
        } else {
            // Portrait: Only Percentage + Offset
            title = `${profitOrLossSign}${percentageRounded}%${offsetPercentageText}`;
        }
    } else {
        title = `${profitOrLossSign}${formatCurrency(profitOrLossRounded, accountSymbol)}`;
    }

    return {
        level: currentPrice,
        title,
        isProfit: profitOrLoss >= 0,
        profitOrLoss
    };
}