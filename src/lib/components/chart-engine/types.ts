import type { IChartApi, ISeriesApi } from "lightweight-charts";

/**
 * The standard interface for any Feature (Plugin) that attaches to the Chart.
 * Examples: PositionLines, MarketDataFeed, ClickTrading, ZoomPersistence.
 */
export interface Types {
    /**
     * Unique identifier for the feature (useful for debugging/hot-swapping)
     */
    id: string;

    /**
     * Called when the ChartLogic initializes the chart instance.
     * Use this to create primitives, attach listeners, or set up initial state.
     */
    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void;

    /**
     * Called on every render loop (or data update).
     * Use this to update line positions, calculate PnL, etc.
     *
     * @param context - The shared state object (defined in ChartContext)
     */
    update(context: any): void;

    /**
     * Called when the component unmounts.
     * Clean up event listeners, primitives, and subscriptions here.
     */
    destroy(): void;
}