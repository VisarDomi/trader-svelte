import { LineStyle, type ISeriesApi, type IPriceLine } from "lightweight-charts";
import { viewport } from "$lib/services/viewport.svelte.js";
import * as TRADING from "$lib/constants/trading.js";

// Domain & Presentation
import { EntryLine } from '$lib/presentation/lines/EntryLine.js';
import { StopLossLine } from '$lib/presentation/lines/StopLossLine.js';
import { TakeProfitLine } from '$lib/presentation/lines/TakeProfitLine.js';
import { CurrentPriceLine } from '$lib/presentation/lines/CurrentPriceLine.js';
import type { LineData } from '$lib/presentation/lines/types.js';

// Types
import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { TradeStore } from '$lib/stores/trade.svelte.js';
import type { PositionResponse } from "$lib/types/trading.js";

export class ChartRenderer {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private activeLines: IPriceLine[] = [];

    constructor(
        private readonly marketStore: MarketStore,
        private readonly positionStore: PositionStore,
        private readonly tradeStore: TradeStore,
        private readonly accountStore: AccountStore
    ) {
        // 1. Reactive History Painting (Heavy Operation)
        // Only runs when the history array reference changes (Load or Source Switch)
        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            const history = this.marketStore.history;

            if (this.series && loaded && history.length > 0) {
                this.series.setData(history);
            }
        });

        // 2. Reactive Live Update (Light Operation)
        // Runs on every tick
        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            const lastCandle = this.marketStore.lastCandle;

            if (this.series && loaded && lastCandle) {
                this.series.update(lastCandle);
            }
        });

        // 3. Reactive Line Painting
        $effect(() => {
            let targetPosition: PositionResponse | null = null;

            if (this.tradeStore.isPlanning) {
                targetPosition = this.tradeStore.getMockPosition();
            } else {
                targetPosition = this.positionStore.activePosition;
            }

            // Trigger re-render when these change
            const _tick = this.marketStore.currentPrice;
            const _width = viewport.width;

            this.drawLines(targetPosition);
        });
    }

    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;

        // Initial Data Hydration (handles race condition if data loaded before init)
        if (this.marketStore.isLoaded && this.marketStore.history.length > 0) {
            this.series.setData(this.marketStore.history);
        }
    }

    private drawLines(response: PositionResponse | null) {
        if (!this.series) return;

        this.clearLines();
        this.series.applyOptions({ priceLineColor: "", title: "" } as any);

        if (!response) return;

        const position = response.position;
        const market = response.market;
        const initialBalance = position.initialBalance || 0;
        const symbol = this.accountStore.activeSymbol;
        const isLandscape = viewport.width > viewport.height;

        // 1. Static Lines
        const linesToDraw = [
            new EntryLine(position, market.epic),
            new TakeProfitLine(position, initialBalance, symbol),
            new StopLossLine(position, initialBalance, symbol)
        ];

        linesToDraw.forEach(lineObj => {
            const data = lineObj.getData(isLandscape);
            this.renderPriceLine(data);
        });

        // 2. Dynamic Line (Current Price)
        const currentPrice = position.direction === TRADING.BUY_DIRECTION
            ? this.marketStore.bid
            : this.marketStore.offer;

        if (currentPrice > 0) {
            const currentObj = new CurrentPriceLine(position, currentPrice, initialBalance, symbol);
            const data = currentObj.getData(isLandscape);

            this.series.applyOptions({
                priceLineColor: data.color,
                title: data.title,
            } as any);
        }
    }

    private renderPriceLine(data: LineData | null) {
        if (!data || !this.series) return;

        const line = this.series.createPriceLine({
            price: data.price,
            color: data.color,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: data.title,
        });

        this.activeLines.push(line);
    }

    private clearLines() {
        if (!this.series) return;
        this.activeLines.forEach(l => this.series!.removePriceLine(l));
        this.activeLines = [];
    }

    destroy() {
        this.series = null;
        this.activeLines = [];
    }
}