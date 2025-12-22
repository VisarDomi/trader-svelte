import { type ISeriesApi, type IPriceLine, LineStyle } from "lightweight-charts";
import type { PositionResponse } from "$lib/types/trading.js";
import { viewport } from "$lib/services/viewport.svelte.js";
import * as CHART from "$lib/constants/chart.js";
import * as TRADING from "$lib/constants/trading.js";
import {
    generateStartingLine,
    generateWendyLine,
    generateLamboLine,
    generateCurrentLine
} from '$lib/utils/lines.js';

// Dependencies
import { marketStore } from '$lib/stores/market.svelte.js';
import { accountStore } from '$lib/stores/account.svelte.js';

export class ChartLines {
    private series: ISeriesApi<"Candlestick"> | null = null;

    // Fixed Lines
    private entryLine: IPriceLine | null = null;
    private tpLine: IPriceLine | null = null;
    private slLine: IPriceLine | null = null;

    // init with series
    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;
    }

    /**
     * Main render loop.
     * position: The active position (real) or the planned trade (mock)
     */
    update(position: PositionResponse | null) {
        if (!this.series) return;

        // Clean slate
        this.clear();

        // Always reset base line style for the main series (Current Price Line default)
        this.series.applyOptions({
            priceLineColor: "", // reset to default
            title: ""
        } as any);

        if (!position) return;

        const p = position.position;
        const initialBalance = p.initialBalance || 0;
        const accountSymbol = accountStore.activeSymbol;
        const isLandscape = viewport.width > viewport.height;
        const epic = position.market.epic;

        // 1. Static Lines (Entry, TP, SL)
        this.drawStaticLines(p, epic, initialBalance, accountSymbol, isLandscape);

        // 2. Dynamic Line (Current Price PnL)
        // We only draw PnL on the current price line if we have market data
        if (marketStore.lastCandle) {
            const currentPrice = p.direction === TRADING.BUY_DIRECTION
                ? marketStore.bid
                : marketStore.offer;

            const lineInfo = generateCurrentLine(
                p,
                currentPrice,
                initialBalance,
                accountSymbol,
                isLandscape
            );

            // We hijack the series "Price Line" to show PnL
            const priceLineColor = lineInfo.isProfit ? "#22958a" : "#bf4240";
            this.series.applyOptions({
                priceLineColor,
                title: lineInfo.title,
            } as any);
        }
    }

    private drawStaticLines(p: any, epic: string, ib: number, sym: string, landscape: boolean) {
        if (!this.series) return;

        const startInfo = generateStartingLine(p, epic, landscape);
        this.entryLine = this.series.createPriceLine({
            price: startInfo.level,
            color: CHART.STARTING_LINE_COLOR,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: startInfo.title,
        });

        const lamboInfo = generateLamboLine(p, ib, sym, landscape);
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

        const wendyInfo = generateWendyLine(p, ib, sym, landscape);
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