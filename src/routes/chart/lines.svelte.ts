import { type ISeriesApi, type IPriceLine, LineStyle } from "lightweight-charts";
import type { PositionResponse } from "$lib/types/trading.js";
import { viewport } from "$lib/services/viewport.svelte.js";
import * as CHART from "$lib/constants/chart.js";
import {
    generateStartingLine,
    generateWendyLine,
    generateLamboLine
} from '$lib/utils/lines.js';

export class ChartLines {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private entryLine: IPriceLine | null = null;
    private tpLine: IPriceLine | null = null;
    private slLine: IPriceLine | null = null;

    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;
    }

    update(position: PositionResponse | null, accountSymbol: string) {
        if (!this.series) return;

        this.clear();

        if (!position) return;

        const p = position.position;
        const initialBalance = p.initialBalance || 0;
        const isLandscape = viewport.width > viewport.height;

        // 1. STARTING LINE
        // Now passing isLandscape
        const startInfo = generateStartingLine(p, position.market.epic, isLandscape);
        this.entryLine = this.series.createPriceLine({
            price: startInfo.level,
            color: CHART.STARTING_LINE_COLOR,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: startInfo.title,
        });

        // 2. LAMBO (TP)
        const lamboInfo = generateLamboLine(p, initialBalance, accountSymbol, isLandscape);
        if (lamboInfo) {
            this.tpLine = this.series.createPriceLine({
                price: lamboInfo.level,
                color: CHART.LAMBO_LINE_COLOR,
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title: lamboInfo.title,
            });
        }

        // 3. WENDY (SL)
        const wendyInfo = generateWendyLine(p, initialBalance, accountSymbol, isLandscape);
        if (wendyInfo) {
            this.slLine = this.series.createPriceLine({
                price: wendyInfo.level,
                color: CHART.WENDY_LINE_COLOR,
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title: wendyInfo.title,
            });
        }
    }

    clear() {
        if (!this.series) return;
        if (this.entryLine) {
            this.series.removePriceLine(this.entryLine);
            this.entryLine = null;
        }
        if (this.tpLine) {
            this.series.removePriceLine(this.tpLine);
            this.tpLine = null;
        }
        if (this.slLine) {
            this.series.removePriceLine(this.slLine);
            this.slLine = null;
        }
    }
}