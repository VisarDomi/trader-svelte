import type { IChartApi, ISeriesApi, IPriceLine } from "lightweight-charts";
import { LineStyle } from "lightweight-charts";
import type { ChartFeature } from "$lib/modules/chart/core/ChartFeature.js";
import { ChartContext } from "$lib/modules/chart/core/ChartContext.svelte.js";
import { EntryLine } from "$lib/modules/chart/utils/lines/EntryLine.js";
import { StopLossLine } from "$lib/modules/chart/utils/lines/StopLossLine.js";
import { TakeProfitLine } from "$lib/modules/chart/utils/lines/TakeProfitLine.js";
import { TradeCalculator } from "$lib/modules/trading/domain/TradeCalculator.js";
import { LineTitleFormatter } from "$lib/modules/chart/utils/formatters/LineTitleFormatter.js";
import type { LineData } from "$lib/modules/chart/utils/lines/types.js";

const KEY_ENTRY = 'ENTRY';
const KEY_SL = 'SL';
const KEY_TP = 'TP';

export class PositionLinesFeature implements ChartFeature {
    id = "position_lines";

    private series: ISeriesApi<"Candlestick"> | null = null;
    private lines = new Map<string, IPriceLine>();

    private calculator = new TradeCalculator();
    private formatter: LineTitleFormatter | null = null;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.series = series;
        // We defer formatter init until update when we have symbol data,
        // or we could assume USD default.
    }

    update(context: ChartContext): void {
        if (!this.series) return;

        // Ensure formatter exists
        if (!this.formatter) {
            this.formatter = new LineTitleFormatter(context.activeSymbol);
        }

        // Determine which position to show (Actual or Planned)
        // Note: Logic allows checking 'isPlanningTrade' from context if we map it
        const position = context.activePosition;

        if (!position) {
            this.clearAll();
            return;
        }

        const body = position.position;
        const market = position.market;
        const initialBalance = body.initialBalance || 0;
        const isLandscape = context.viewportWidth > context.viewportHeight;

        // 1. Entry Line
        const entryGen = new EntryLine(body, market.epic);
        this.updateLine(KEY_ENTRY, entryGen.getData(isLandscape));

        // 2. Stop Loss Line
        const slGen = new StopLossLine(body, initialBalance, this.calculator, this.formatter);
        this.updateLine(KEY_SL, slGen.getData(isLandscape));

        // 3. Take Profit Line
        const tpGen = new TakeProfitLine(body, initialBalance, this.calculator, this.formatter);
        this.updateLine(KEY_TP, tpGen.getData(isLandscape));
    }

    destroy(): void {
        this.clearAll();
        this.series = null;
    }

    private updateLine(key: string, data: LineData | null) {
        if (!this.series) return;

        if (data) {
            if (this.lines.has(key)) {
                const line = this.lines.get(key)!;
                line.applyOptions({
                    price: data.price,
                    color: data.color,
                    title: data.title
                });
            } else {
                const line = this.series.createPriceLine({
                    price: data.price,
                    color: data.color,
                    lineWidth: 2,
                    lineStyle: LineStyle.Solid,
                    axisLabelVisible: true,
                    title: data.title,
                });
                this.lines.set(key, line);
            }
        } else {
            this.removeLine(key);
        }
    }

    private removeLine(key: string) {
        if (this.lines.has(key)) {
            const line = this.lines.get(key)!;
            this.series?.removePriceLine(line);
            this.lines.delete(key);
        }
    }

    private clearAll() {
        this.lines.forEach(line => this.series?.removePriceLine(line));
        this.lines.clear();
    }
}