import { LineStyle, type ISeriesApi, type IPriceLine } from "lightweight-charts";
import { viewport } from "$lib/services/viewport.svelte.js";
import * as TRADING from "$lib/constants/trading.js";

import { TradeCalculator } from '$lib/domain/trade/TradeCalculator.js';
import { LineTitleFormatter } from '$lib/presentation/formatters/LineTitleFormatter.js';

import { EntryLine } from '$lib/presentation/lines/EntryLine.js';
import { StopLossLine } from '$lib/presentation/lines/StopLossLine.js';
import { TakeProfitLine } from '$lib/presentation/lines/TakeProfitLine.js';
import { CurrentPriceLine } from '$lib/presentation/lines/CurrentPriceLine.js';
import type { LineData } from '$lib/presentation/lines/types.js';

import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { TradeStore } from '$lib/stores/trade.svelte.js';
import type { PositionResponse } from "$lib/types/trading.js";

const KEY_ENTRY = 'ENTRY';
const KEY_SL = 'SL';
const KEY_TP = 'TP';
const KEY_CURRENT = 'CURRENT';

export class ChartRenderer {
    private series: ISeriesApi<"Candlestick"> | null = null;

    // Retained Mode: Store line references mapped by ID
    private lines = new Map<string, IPriceLine>();

    // Reusable Dependencies
    private calculator = new TradeCalculator();
    private formatter: LineTitleFormatter | null = null;

    constructor(
        private readonly marketStore: MarketStore,
        private readonly positionStore: PositionStore,
        private readonly tradeStore: TradeStore,
        private readonly accountStore: AccountStore
    ) {
        // Effect 1: History Loading
        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            const history = this.marketStore.history;

            if (this.series && loaded && history.length > 0) {
                this.series.setData(history);
            }
        });

        // Effect 2: Live Candle Updates
        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            const lastCandle = this.marketStore.lastCandle;

            if (this.series && loaded && lastCandle) {
                this.series.update(lastCandle);
            }
        });

        // Effect 3: Static Position Lines (Entry, SL, TP)
        $effect(() => {
            // We read dependencies here to register the effect
            const _pos = this.positionStore.activePosition;
            const _plan = this.tradeStore.isPlanning;
            const _width = viewport.width;

            // Then delegate to the shared render function
            this.renderStatic();
        });

        // Effect 4: Dynamic Price Line (Current PnL)
        $effect(() => {
            // Register dependencies
            const _pos = this.positionStore.activePosition;
            const _plan = this.tradeStore.isPlanning;
            const tick = this.marketStore.currentPrice;
            const _width = viewport.width;

            // Delegate
            this.renderDynamic(tick);
        });
    }

    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;
        this.formatter = new LineTitleFormatter(this.accountStore.activeSymbol);
        this.lines.clear();

        // 1. Restore History if available
        if (this.marketStore.isLoaded && this.marketStore.history.length > 0) {
            this.series.setData(this.marketStore.history);
        }

        // 2. Force a render of lines now that series is available
        // This fixes the bug where data loaded *before* init was ignored
        this.renderStatic();
        this.renderDynamic(this.marketStore.currentPrice);
    }

    // Helper to resolve which position we are drawing (Active or Planned)
    private getTargetPosition(): PositionResponse | null {
        if (this.tradeStore.isPlanning) {
            return this.tradeStore.getMockPosition();
        }
        return this.positionStore.activePosition;
    }

    private renderStatic() {
        if (!this.series || !this.formatter) return;

        const target = this.getTargetPosition();
        this.updateStaticLines(target);
    }

    private renderDynamic(currentPrice: number) {
        if (!this.series || !this.formatter) return;

        const target = this.getTargetPosition();
        this.updateCurrentPriceLine(target, currentPrice);
    }

    private updateStaticLines(response: PositionResponse | null) {
        if (!this.series || !this.formatter) return;

        if (!response) {
            this.removeLine(KEY_ENTRY);
            this.removeLine(KEY_SL);
            this.removeLine(KEY_TP);
            return;
        }

        const position = response.position;
        const market = response.market;
        const initialBalance = position.initialBalance || 0;
        const isLandscape = viewport.width > viewport.height;

        // 1. Entry Line
        const entryGen = new EntryLine(position, market.epic);
        this.updateLine(KEY_ENTRY, entryGen.getData(isLandscape));

        // 2. Stop Loss
        const slGen = new StopLossLine(position, initialBalance, this.calculator, this.formatter);
        this.updateLine(KEY_SL, slGen.getData(isLandscape));

        // 3. Take Profit
        const tpGen = new TakeProfitLine(position, initialBalance, this.calculator, this.formatter);
        this.updateLine(KEY_TP, tpGen.getData(isLandscape));
    }

    private updateCurrentPriceLine(response: PositionResponse | null, currentPrice: number) {
        if (!this.series || !this.formatter) return;

        // Reset the default lightweight-charts price line if no position
        if (!response || currentPrice === 0) {
            this.series.applyOptions({ priceLineVisible: false });
            this.removeLine(KEY_CURRENT);
            return;
        }

        const position = response.position;
        const initialBalance = position.initialBalance || 0;
        const isLandscape = viewport.width > viewport.height;

        // Determine effective price based on direction
        const relevantPrice = position.direction === TRADING.BUY_DIRECTION
            ? this.marketStore.bid
            : this.marketStore.offer;

        if (relevantPrice === 0) return;

        const currentGen = new CurrentPriceLine(
            position,
            relevantPrice,
            initialBalance,
            this.calculator,
            this.formatter
        );

        const data = currentGen.getData(isLandscape);

        // We use the built-in PriceLine for the current price to ensure it aligns with the candle edge
        this.series.applyOptions({
            priceLineVisible: true,
            priceLineColor: data.color,
            title: data.title
        });
    }

    private updateLine(key: string, data: LineData | null) {
        if (!this.series) return;

        // Case A: Data exists, create or update
        if (data) {
            if (this.lines.has(key)) {
                // Update existing
                const line = this.lines.get(key)!;
                line.applyOptions({
                    price: data.price,
                    color: data.color,
                    title: data.title
                });
            } else {
                // Create new
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
        }
        // Case B: Data is null, remove if exists
        else {
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

    destroy() {
        this.lines.forEach(line => this.series?.removePriceLine(line));
        this.lines.clear();
        this.series = null;
    }
}