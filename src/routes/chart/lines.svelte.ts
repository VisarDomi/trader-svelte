import { type ISeriesApi, type IPriceLine, LineStyle } from "lightweight-charts";
import type { PositionResponse } from "$lib/types/trading.js";
import { viewport } from "$lib/services/viewport.svelte.js";
import * as TRADING from "$lib/constants/trading.js";
import {
    generateStartingLine,
    generateWendyLine,
    generateLamboLine,
    generateCurrentLine,
    type LinePresentation
} from '$lib/utils/lines.js';

// Types for Injection
import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';

export class ChartLines {
    private series: ISeriesApi<"Candlestick"> | null = null;

    // Fixed Lines
    private entryLine: IPriceLine | null = null;
    private tpLine: IPriceLine | null = null;
    private slLine: IPriceLine | null = null;

    constructor(
        private readonly marketStore: MarketStore,
        private readonly accountStore: AccountStore
    ) {}

    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;
    }

    update(position: PositionResponse | null) {
        if (!this.series) return;

        this.clear();

        // Reset base line style
        this.series.applyOptions({
            priceLineColor: "",
            title: ""
        } as any);

        if (!position) return;

        const p = position.position;
        const initialBalance = p.initialBalance || 0;
        const accountSymbol = this.accountStore.activeSymbol;
        const isLandscape = viewport.width > viewport.height;
        const epic = position.market.epic;

        // 1. Static Lines
        const entryData = generateStartingLine(p, epic, isLandscape);
        this.entryLine = this.createLine(entryData);

        const tpData = generateLamboLine(p, initialBalance, accountSymbol, isLandscape);
        if (tpData) this.tpLine = this.createLine(tpData);

        const slData = generateWendyLine(p, initialBalance, accountSymbol, isLandscape);
        if (slData) this.slLine = this.createLine(slData);

        // 2. Dynamic Line (Current Price PnL)
        if (this.marketStore.lastCandle) {
            const currentPrice = p.direction === TRADING.BUY_DIRECTION
                ? this.marketStore.bid
                : this.marketStore.offer;

            const lineInfo = generateCurrentLine(
                p,
                currentPrice,
                initialBalance,
                accountSymbol,
                isLandscape
            );

            this.series.applyOptions({
                priceLineColor: lineInfo.color,
                title: lineInfo.title,
            } as any);
        }
    }

    private createLine(data: LinePresentation): IPriceLine {
        return this.series!.createPriceLine({
            price: data.price,
            color: data.color,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: data.title,
        });
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