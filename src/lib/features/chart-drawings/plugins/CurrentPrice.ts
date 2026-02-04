import type { IChartApi, ISeriesApi, IPriceLine } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";
import { calculateCurrentPriceLine } from '$lib/features/chart-drawings/utils/calcPriceLine.js';
import { TradeCalculator } from '$lib/domains/trading/domain/TradeCalculator.js';
import { LineTitleFormatter } from '$lib/features/chart-drawings/utils/LineTitleFormatter.js';
import { BASE_SERIES_TITLE } from "$lib/shared/constants/chart.js";

export class CurrentPrice implements Types {
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

        // --- MODE 1: DEFAULT (No Position) ---
        // Restore standard chart behavior: Native line ON, Custom line OFF
        if (!position || currentPrice === 0) {
            this.clearCustomLine();

            this.series.applyOptions({
                priceLineVisible: true,
                lastValueVisible: true,
                title: BASE_SERIES_TITLE // Show "Current Price"
            });
            return;
        }

        // --- MODE 2: ACTIVE TRADING ---
        // Hide standard chart behavior: Native line OFF, Custom line ON

        // 1. Hide Native Line & Label
        this.series.applyOptions({
            priceLineVisible: false,
            lastValueVisible: false,
            title: "" // Clear title so it doesn't overlap or show in legend
        });

        const body = position.position;
        const initialBalance = body.initialBalance || 0;
        const isLandscape = context.viewportWidth > context.viewportHeight;

        // 2. Calculate Custom Data
        const data = calculateCurrentPriceLine(
            body,
            currentPrice,
            initialBalance,
            this.calculator,
            this.formatter,
            isLandscape
        );

        // 3. Draw Custom Line
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
        this.clearCustomLine();
        this.series = null;
    }

    private clearCustomLine() {
        if (this.series && this.line) {
            this.series.removePriceLine(this.line);
            this.line = null;
        }
    }
}