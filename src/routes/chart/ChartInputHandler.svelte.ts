import type { ISeriesApi, MouseEventParams } from 'lightweight-charts';
import * as TRADING from '$lib/constants/trading.js';
import type { Direction } from '$lib/types/trading.js';
import type { ChartData } from '$lib/types/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';

export interface TradeIntent {
    entryPrice: number; // The price we get filled at (Bid/Ask)
    targetPrice: number; // The price clicked (TP)
    direction: Direction;
    source: ChartData; // Which price line triggered this (Bid vs Ask)
}

export class ChartInputHandler {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private marketDetails: MarketDetailsResponse | null = null;

    constructor(
        private readonly onIntent: (intent: TradeIntent) => void,
        private readonly isBlocked: () => boolean
    ) {}

    configure(
        series: ISeriesApi<"Candlestick">,
        marketDetails: MarketDetailsResponse
    ) {
        this.series = series;
        this.marketDetails = marketDetails;
    }

    handleChartClick = (param: MouseEventParams) => {
        // 1. Checks
        if (this.isBlocked()) return;
        if (!this.series || !this.marketDetails) return;
        if (!param.point) return;

        // 2. Coordinate conversion
        const price = this.series.coordinateToPrice(param.point.y);
        if (!price) return;

        // 3. Current Market Prices
        const bid = this.marketDetails.snapshot.bid;
        const offer = this.marketDetails.snapshot.offer;

        // 4. Logic: Determine Direction based on Click vs Spread
        const { direction, source } = this.determineDirection(price, bid, offer);

        if (!direction || !source) return; // Clicked inside spread or invalid

        // 5. Logic: Execution Price
        // Buy -> Pay Ask
        // Sell -> Sell at Bid
        const entryPrice = direction === TRADING.BUY_DIRECTION ? offer : bid;

        // 6. Emit Intent
        this.onIntent({
            entryPrice,
            targetPrice: price,
            direction,
            source
        });
    };

    private determineDirection(
        price: number,
        bid: number,
        ask: number
    ): { direction: Direction | null, source: ChartData | null } {
        // Clicked ABOVE the spread -> Buying expecting it to go up to that target
        if (price > ask) {
            return {
                direction: TRADING.BUY_DIRECTION,
                source: TRADING.CHART_DATA_SOURCE_BID
            };
        }

        // Clicked BELOW the spread -> Selling expecting it to go down to that target
        if (price < bid) {
            return {
                direction: TRADING.SELL_DIRECTION,
                source: TRADING.CHART_DATA_SOURCE_OFR
            };
        }

        return { direction: null, source: null };
    }
}