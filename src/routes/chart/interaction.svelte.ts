import type { ISeriesApi, MouseEventParams } from 'lightweight-charts';
import * as TRADING from '$lib/constants/trading.js';
import type { MarketDetailsResponse } from '$lib/types/market.js';
import type { ChartData, Direction } from '$lib/types/trading.js';
import {type TradeStore} from '$lib/stores/trade.svelte.js';
import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';

export class ChartInteraction {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private marketDetails: MarketDetailsResponse | null = null;
    private userLeverage = 1;

    constructor(
        private readonly tradeManager: TradeStore,
        private readonly marketStore: MarketStore,
        private readonly positionStore: PositionStore
    ) {}

    configure(
        series: ISeriesApi<"Candlestick">,
        marketDetails: MarketDetailsResponse,
        userLeverage: number
    ) {
        this.series = series;
        this.marketDetails = marketDetails;
        this.userLeverage = userLeverage;
    }

    handleChartClick = (param: MouseEventParams) => {
        if (this.isInteractionBlocked()) return;
        if (!this.series || !this.marketDetails) return;
        if (!param.point) return;

        const price = this.series.coordinateToPrice(param.point.y);
        if (!price) return;

        this.processPriceSelection(price);
    };

    private isInteractionBlocked(): boolean {
        // Prevent interaction if a position exists or a trade is currently executing
        return !!(this.positionStore.activePosition || this.tradeManager.isExecuting);
    }

    private processPriceSelection(clickedPrice: number) {
        const bid = this.marketStore.bid;
        const ask = this.marketStore.offer;

        // Determine Direction based on click relative to spread
        const { direction, source } = this.determineDirection(clickedPrice, bid, ask);

        if (!direction || !source) return; // Clicked inside spread or invalid

        // Switch Chart Data Source to match direction for visual clarity
        this.marketStore.setDataSource(source);

        // Execution Price Logic:
        // Buy -> Pay Ask
        // Sell -> Sell at Bid
        const executionPrice = direction === TRADING.BUY_DIRECTION ? ask : bid;

        // Delegate calculation to TradeManager
        this.tradeManager.plan(
            executionPrice,  // The price we get filled at
            clickedPrice,    // The price where we clicked (Target/TP)
            direction,
            this.marketDetails!,
            this.userLeverage
        );
    }

    private determineDirection(
        price: number,
        bid: number,
        ask: number
    ): { direction: Direction | null, source: ChartData | null } {
        if (price > ask) {
            return {
                direction: TRADING.BUY_DIRECTION,
                source: TRADING.CHART_DATA_SOURCE_BID
            };
        }

        if (price < bid) {
            return {
                direction: TRADING.SELL_DIRECTION,
                source: TRADING.CHART_DATA_SOURCE_OFR
            };
        }

        return { direction: null, source: null };
    }
}