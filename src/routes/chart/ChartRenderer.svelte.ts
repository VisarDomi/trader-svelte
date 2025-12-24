import { LineStyle, type ISeriesApi, type IPriceLine } from "lightweight-charts";
import { viewport } from "$lib/services/viewport.svelte.js";
import * as TRADING from "$lib/constants/trading.js";
import { DateTime } from 'luxon';

import { TradeCalculator } from '$lib/domain/trade/TradeCalculator.js';
import { LineTitleFormatter } from '$lib/presentation/formatters/LineTitleFormatter.js';

import { EntryLine } from '$lib/presentation/lines/EntryLine.js';
import { StopLossLine } from '$lib/presentation/lines/StopLossLine.js';
import { TakeProfitLine } from '$lib/presentation/lines/TakeProfitLine.js';
import { calculateCurrentPriceLine } from '$lib/presentation/lines/CurrentPriceLine.js';
import type { LineData } from '$lib/presentation/lines/types.js';
import { FeeLinePrimitive } from '$lib/presentation/primitives/FeeLinePrimitive.js';

import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { TradeStore } from '$lib/stores/trade.svelte.js';
import type { PositionResponse } from "$lib/types/trading.js";
import type { MarketDetailsResponse } from "$lib/types/market.js";

const KEY_ENTRY = 'ENTRY';
const KEY_SL = 'SL';
const KEY_TP = 'TP';
const KEY_CURRENT = 'CURRENT';

export class ChartRenderer {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private feePrimitive: FeeLinePrimitive | null = null;

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
            const _trigger = this.marketStore.updateTrigger;

            if (this.series && loaded && lastCandle) {
                this.series.update(lastCandle);
            }
        });

        // Effect 3: Static Position Lines
        $effect(() => {
            const _pos = this.positionStore.activePosition;
            const _plan = this.tradeStore.isPlanning;
            const _width = viewport.width;

            this.renderStatic();
        });

        // Effect 4: Dynamic Price Line
        $effect(() => {
            const _pos = this.positionStore.activePosition;
            const _plan = this.tradeStore.isPlanning;
            const tick = this.marketStore.currentPrice;
            const _width = viewport.width;

            this.renderDynamic(tick);
        });
    }

    init(series: ISeriesApi<"Candlestick">, marketDetails: MarketDetailsResponse | null) {
        this.series = series;
        this.formatter = new LineTitleFormatter(this.accountStore.activeSymbol);
        this.lines.clear();

        // 0. Initialize Primitives
        this.initPrimitives(marketDetails);

        // 1. Restore History
        if (this.marketStore.isLoaded && this.marketStore.history.length > 0) {
            this.series.setData(this.marketStore.history);
        }

        // 2. Force Render
        this.renderStatic();
        this.renderDynamic(this.marketStore.currentPrice);
    }

    private initPrimitives(marketDetails: MarketDetailsResponse | null) {
        if (!this.series) return;

        // Cleanup existing if any (though init implies fresh start usually)
        if (this.feePrimitive) {
            this.series.detachPrimitive(this.feePrimitive);
        }

        const feeData = marketDetails?.instrument.overnightFee;
        const timestampMs = feeData?.swapChargeTimestamp;

        if (timestampMs) {
            // Convert MS to Seconds (UTCTimestamp)
            const timestampSeconds = Math.floor(timestampMs / 1000);

            // Format for display
            const fmt = DateTime.fromMillis(timestampMs).toFormat("HH:mm");

            this.feePrimitive = new FeeLinePrimitive(timestampSeconds, fmt);
            this.series.attachPrimitive(this.feePrimitive);
        }
    }

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

        const entryGen = new EntryLine(position, market.epic);
        this.updateLine(KEY_ENTRY, entryGen.getData(isLandscape));

        const slGen = new StopLossLine(position, initialBalance, this.calculator, this.formatter);
        this.updateLine(KEY_SL, slGen.getData(isLandscape));

        const tpGen = new TakeProfitLine(position, initialBalance, this.calculator, this.formatter);
        this.updateLine(KEY_TP, tpGen.getData(isLandscape));
    }

    private updateCurrentPriceLine(response: PositionResponse | null, currentPrice: number) {
        if (!this.series || !this.formatter) return;

        if (!response || currentPrice === 0) {
            this.series.applyOptions({ priceLineVisible: false });
            this.removeLine(KEY_CURRENT);
            return;
        }

        const position = response.position;
        const initialBalance = position.initialBalance || 0;
        const isLandscape = viewport.width > viewport.height;

        const relevantPrice = position.direction === TRADING.BUY_DIRECTION
            ? this.marketStore.bid
            : this.marketStore.offer;

        if (relevantPrice === 0) return;

        const data = calculateCurrentPriceLine(
            position,
            relevantPrice,
            initialBalance,
            this.calculator,
            this.formatter,
            isLandscape
        );

        this.series.applyOptions({
            priceLineVisible: true,
            priceLineColor: data.color,
            title: data.title
        });
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
        }
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
        if (this.series && this.feePrimitive) {
            this.series.detachPrimitive(this.feePrimitive);
        }
        this.lines.forEach(line => this.series?.removePriceLine(line));
        this.lines.clear();
        this.series = null;
        this.feePrimitive = null;
    }
}