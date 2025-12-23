import type { ISeriesApi, MouseEventParams } from 'lightweight-charts';
import * as TRADING from '$lib/constants/trading.js';
import type { Direction } from '$lib/types/trading.js';
import type { ChartData } from '$lib/types/trading.js';
import type { MarketStore } from '$lib/stores/market.svelte.js';

export interface TradeIntent {
    entryPrice: number;
    targetPrice: number;
    direction: Direction;
    source: ChartData;
}

export class ChartInputHandler {
    private series: ISeriesApi<"Candlestick"> | null = null;

    constructor(
        private readonly marketStore: MarketStore,
        private readonly onIntent: (intent: TradeIntent) => void,
        private readonly isBlocked: () => boolean
    ) {}

    configure(series: ISeriesApi<"Candlestick">) {
        this.series = series;
    }

    handleChartClick = (param: MouseEventParams) => {
        if (this.isBlocked()) return;
        if (!this.series) return;
        if (!param.point) return;

        const price = this.series.coordinateToPrice(param.point.y);
        if (!price) return;

        const bid = this.marketStore.bid;
        const offer = this.marketStore.offer;

        if (bid === 0 || offer === 0) return;

        const { direction, source } = this.determineDirection(price, bid, offer);

        if (!direction || !source) return;

        const entryPrice = direction === TRADING.BUY_DIRECTION ? offer : bid;

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