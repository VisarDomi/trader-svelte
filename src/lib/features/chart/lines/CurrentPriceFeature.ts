import type { IChartApi, ISeriesApi, IPriceLine } from "lightweight-charts";
import type { ChartFeature } from "$lib/core/ChartFeature.js";
import { ChartContext } from "$lib/features/chart/ChartContext.svelte.js";
import { calculateCurrentPriceLine } from '$lib/presentation/lines/CurrentPriceLine.js';
import { TradeCalculator } from '$lib/domain/trade/TradeCalculator.js';
import { LineTitleFormatter } from '$lib/presentation/formatters/LineTitleFormatter.js';
import { BASE_SERIES_TITLE } from "$lib/constants/chart.js";
import * as TRADING from "$lib/constants/trading.js";

export class CurrentPriceFeature implements ChartFeature {
    id = "current_price_line";

    private series: ISeriesApi<"Candlestick"> | null = null;
    private line: IPriceLine | null = null;

    private calculator = new TradeCalculator();
    private formatter: LineTitleFormatter | null = null;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.series = series;
    }

    update(context: ChartContext): void {
        if (!this.series) return;

        if (!this.formatter) {
            this.formatter = new LineTitleFormatter(context.activeSymbol);
        }

        const position = context.activePosition;
        const currentPrice = context.currentPrice;

        // If no position or invalid price, hide line/reset title
        if (!position || currentPrice === 0) {
            this.clear();
            // Reset series title to default
            this.series.applyOptions({
                priceLineVisible: false,
                title: BASE_SERIES_TITLE
            });
            return;
        }

        const body = position.position;
        const initialBalance = body.initialBalance || 0;
        const isLandscape = context.viewportWidth > context.viewportHeight;

        // Calculate Data
        const data = calculateCurrentPriceLine(
            body,
            currentPrice,
            initialBalance,
            this.calculator,
            this.formatter,
            isLandscape
        );

        // Update Series Options
        this.series.applyOptions({
            priceLineVisible: true,
            priceLineColor: data.color,
            title: data.title
        });

        // Draw the line
        if (this.line) {
            this.line.applyOptions({
                price: data.price,
                color: data.color,
                title: data.title
            });
        } else {
            this.line = this.series.createPriceLine({
                price: data.price,
                color: data.color,
                lineWidth: 2,
                lineStyle: 0, // Solid
                axisLabelVisible: true,
                title: data.title,
            });
        }
    }

    destroy(): void {
        this.clear();
        this.series = null;
    }

    private clear() {
        if (this.series && this.line) {
            this.series.removePriceLine(this.line);
            this.line = null;
        }
    }
}