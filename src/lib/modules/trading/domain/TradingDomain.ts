import * as TRADING from '$lib/shared/constants/trading.js';
import type { Direction } from '$lib/shared/types/trading.js';
import type { ChartData } from '$lib/shared/types/trading.js';

export interface TradeIntent {
    entryPrice: number;
    targetPrice: number;
    direction: Direction;
    source: ChartData;
}

export class TradingDomain {
    /**
     * Determines the trade direction and data source based on a user's click price
     * relative to the current market bid/ask.
     */
    determineIntent(
        clickPrice: number,
        bid: number,
        offer: number
    ): TradeIntent | null {
        if (bid === 0 || offer === 0) return null;

        let direction: Direction | null = null;
        let source: ChartData | null = null;

        // Logic:
        // Click ABOVE Offer -> Buy (Expecting price to go up from Offer)
        // Click BELOW Bid   -> Sell (Expecting price to go down from Bid)
        // Click BETWEEN     -> Ambiguous (Ignore or default? We ignore for safety)

        if (clickPrice > offer) {
            direction = TRADING.BUY_DIRECTION;
            source = TRADING.CHART_DATA_SOURCE_BID;
        } else if (clickPrice < bid) {
            direction = TRADING.SELL_DIRECTION;
            source = TRADING.CHART_DATA_SOURCE_OFR;
        }

        if (!direction || !source) return null;

        const entryPrice = direction === TRADING.BUY_DIRECTION ? offer : bid;

        return {
            entryPrice,
            targetPrice: clickPrice,
            direction,
            source
        };
    }
}