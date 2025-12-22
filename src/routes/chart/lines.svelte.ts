import { type ISeriesApi, type IPriceLine, LineStyle } from "lightweight-charts";
import { viewport } from "$lib/services/viewport.svelte.js";
import * as TRADING from "$lib/constants/trading.js";

import type { PositionResponse } from "$lib/types/trading.js";
import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';

import { EntryLine } from '$lib/presentation/lines/EntryLine.js';
import { StopLossLine } from '$lib/presentation/lines/StopLossLine.js';
import { TakeProfitLine } from '$lib/presentation/lines/TakeProfitLine.js';
import { CurrentPriceLine } from '$lib/presentation/lines/CurrentPriceLine.js';
import type { LineData } from '$lib/presentation/lines/types.js';

export class ChartLines {
    private series: ISeriesApi<"Candlestick"> | null = null;

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

    update(positionResponse: PositionResponse | null) {
        if (!this.series) return;

        this.clear();
        this.series.applyOptions({ priceLineColor: "", title: "" } as any);

        if (!positionResponse) return;

        const position = positionResponse.position;
        const market = positionResponse.market;
        const isLandscape = viewport.width > viewport.height;
        const initialBalance = position.initialBalance || 0;
        const symbol = this.accountStore.activeSymbol;

        // 1. Static Lines
        const entry = new EntryLine(position, market.epic);
        this.entryLine = this.renderLine(entry.getData(isLandscape));

        const tp = new TakeProfitLine(position, initialBalance, symbol);
        this.tpLine = this.renderLine(tp.getData(isLandscape));

        const sl = new StopLossLine(position, initialBalance, symbol);
        this.slLine = this.renderLine(sl.getData(isLandscape));

        // 2. Dynamic Line (Current Price)
        if (this.marketStore.lastCandle) {
            const currentPrice = position.direction === TRADING.BUY_DIRECTION
                ? this.marketStore.bid
                : this.marketStore.offer;

            const current = new CurrentPriceLine(position, currentPrice, initialBalance, symbol);
            const data = current.getData(isLandscape);

            this.series.applyOptions({
                priceLineColor: data.color,
                title: data.title,
            } as any);
        }
    }

    private renderLine(data: LineData | null): IPriceLine | null {
        if (!data || !this.series) return null;

        return this.series.createPriceLine({
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