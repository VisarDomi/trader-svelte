import { DateTime } from 'luxon';
import * as TRADING from '$lib/constants/trading.js';
import { roundDownToFactor } from '$lib/utils/trading.js';
import { formatTimestampToLocalTime } from '$lib/utils/time.js';
import type { PositionBody, Direction } from '$lib/types/trading.js';

export interface LineInfo {
    level: number;
    title: string;
}

export interface CurrentLineInfo extends LineInfo {
    isProfit: boolean;
    profitOrLoss: number;
}

export function generateStartingLine(p: PositionBody, epic: string): LineInfo {
    const directionText = p.direction === "BUY" ? "You bought" : "You sold";
    let title = `${directionText} ${p.size} ${epic}`;
    if (p.createdDateUTC) {
        const dateSeconds = DateTime.fromISO(p.createdDateUTC, { zone: "utc" }).toSeconds();
        const tradeTime = formatTimestampToLocalTime(dateSeconds as any);
        title += ` at ${tradeTime}`;
    }
    return { level: p.level, title };
}

export function generateWendyLine(p: PositionBody, initialBalance: number): LineInfo | null {
    if (!p.stopLevel) return null;

    const potentialLoss = Math.abs(p.level - p.stopLevel) * p.size;
    const roundedPotentialLoss = roundDownToFactor(potentialLoss, TRADING.ACCOUNT_USD_PRICE_PRECISION);
    let title = `Potential Loss -${roundedPotentialLoss.toFixed(2)}`;

    if (initialBalance !== 0) {
        const pessimisticBalance = initialBalance - potentialLoss;
        const potentialLossPercentage = (potentialLoss / initialBalance) * 100;

        let offsetPercentageText = "";
        if (potentialLossPercentage < 100) {
            const offsetPercentage = (potentialLossPercentage / (100 - potentialLossPercentage)) * 100;
            offsetPercentageText = ` (-+${offsetPercentage.toFixed(2)}%)`;
        }
        title = `Potential Loss -${roundedPotentialLoss.toFixed(2)} (${pessimisticBalance.toFixed(2)}) (-${potentialLossPercentage.toFixed(2)}%)${offsetPercentageText}`;
    }

    return { level: p.stopLevel, title };
}

export function generateLamboLine(p: PositionBody, initialBalance: number): LineInfo | null {
    if (!p.profitLevel) return null;

    const potentialProfit = Math.abs(p.level - p.profitLevel) * p.size;
    const roundedPotentialProfit = roundDownToFactor(potentialProfit, TRADING.ACCOUNT_USD_PRICE_PRECISION);
    let title = `Potential Profit +${roundedPotentialProfit.toFixed(2)}`;

    if (initialBalance !== 0) {
        const optimisticBalance = initialBalance + potentialProfit;
        const potentialProfitPercentage = (potentialProfit / initialBalance) * 100;
        const offsetProfitPercentage = (potentialProfitPercentage / (100 + potentialProfitPercentage)) * 100;

        title = `Potential Profit +${roundedPotentialProfit.toFixed(2)} (${optimisticBalance.toFixed(2)}) (+${potentialProfitPercentage.toFixed(2)}%) (+-${offsetProfitPercentage.toFixed(2)}%)`;
    }

    return { level: p.profitLevel, title };
}

export function generateCurrentLine(p: PositionBody, currentPrice: number, initialBalance: number): CurrentLineInfo {
    let profitOrLoss: number;
    if (p.direction === TRADING.BUY_DIRECTION) {
        profitOrLoss = (currentPrice - p.level) * p.size;
    } else {
        profitOrLoss = (p.level - currentPrice) * p.size;
    }

    const PLUS = "+";
    const MINUS = "-";
    const profitOrLossSign = profitOrLoss >= 0 ? PLUS : MINUS;
    const profitOrLossRounded = roundDownToFactor(Math.abs(profitOrLoss), TRADING.ACCOUNT_USD_PRICE_PRECISION).toFixed(2);
    let title = `${profitOrLossSign}${profitOrLossRounded}`;

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
        title = `${profitOrLossSign}${profitOrLossRounded} (${currentBalance.toFixed(2)}) (${profitOrLossSign}${percentageRounded}%)${offsetPercentageText}`;
    }

    return {
        level: currentPrice,
        title,
        isProfit: profitOrLoss >= 0,
        profitOrLoss
    };
}