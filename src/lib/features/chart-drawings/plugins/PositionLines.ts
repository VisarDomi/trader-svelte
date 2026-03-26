import type { IChartApi, ISeriesApi, IPriceLine } from "lightweight-charts";
import { LineStyle } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";
import { EntryLine } from "$lib/features/chart-drawings/primitives/EntryLine.js";
import { StopLossLine } from "$lib/features/chart-drawings/primitives/StopLossLine.js";
import { TakeProfitLine } from "$lib/features/chart-drawings/primitives/TakeProfitLine.js";
import { TradeCalculator } from "$lib/domains/trading/domain/TradeCalculator.js";
import { LineTitleFormatter } from "$lib/features/chart-drawings/utils/LineTitleFormatter.js";
import type { LineData } from "$lib/features/chart-drawings/types.js";

const KEY_ENTRY = 'ENTRY';
const KEY_SL = 'SL';
const KEY_TP = 'TP';

export class PositionLines implements Types {
    id = "position_lines";

    private series: ISeriesApi<"Candlestick"> | null = null;
    private lines = new Map<string, IPriceLine>();

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

        if (!position) {
            this.clearAll();
            return;
        }

        const body = position.position;
        const market = position.market;
        const initialBalance = body.initialBalance || 0;
        const isLandscape = context.viewportWidth > context.viewportHeight;

        const entryGen = new EntryLine(body, market.epic);
        this.updateLine(KEY_ENTRY, entryGen.getData(isLandscape));

        const slGen = new StopLossLine(body, initialBalance, this.calculator, this.formatter);
        this.updateLine(KEY_SL, slGen.getData(isLandscape));

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
