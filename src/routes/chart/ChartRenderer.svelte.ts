import type { ISeriesApi, IChartApi } from "lightweight-charts";
import type { ChartFeature } from "$lib/core/ChartFeature.js";
import type { ChartContext } from "$lib/features/chart/ChartContext.svelte.js";

// Import stores only for legacy initialization if needed,
// otherwise everything should come from Context.
import type { MarketStore } from '$lib/stores/market.svelte.js';
import type { AccountStore } from '$lib/stores/account.svelte.js';
import type { PositionStore } from '$lib/stores/position.svelte.js';
import type { TradeStore } from '$lib/stores/trade.svelte.js';

// Features
import { PositionLinesFeature } from "$lib/features/chart/lines/PositionLinesFeature.js";
// We will migrate FeeLinePrimitive and CurrentPriceLine in subsequent steps
// to keep the diff minimal, but for now we keep the imports for migration references.

import { FeeLinePrimitive } from '$lib/presentation/primitives/FeeLinePrimitive.js';
import { calculateCurrentPriceLine } from '$lib/presentation/lines/CurrentPriceLine.js';
import { DateTime } from 'luxon';
import { LineStyle } from "lightweight-charts";
import { BASE_SERIES_TITLE } from "$lib/constants/chart.js";
import { TradeCalculator } from '$lib/domain/trade/TradeCalculator.js';
import { LineTitleFormatter } from '$lib/presentation/formatters/LineTitleFormatter.js';
import * as TRADING from "$lib/constants/trading.js";


export class ChartRenderer {
    // FIX: Make these reactive so the effect picks up init() changes
    private chart = $state<IChartApi | null>(null);
    private series = $state<ISeriesApi<"Candlestick"> | null>(null);
    private context = $state<ChartContext | null>(null);

    // Feature Registry
    private features: ChartFeature[] = [];

    // Legacy Primitives (To be migrated)
    private feePrimitive: FeeLinePrimitive | null = null;
    private currentPriceLine: any = null; // Lightweight Charts IPriceLine
    private calculator = new TradeCalculator();
    private formatter: LineTitleFormatter | null = null;

    constructor(
        private readonly marketStore: MarketStore,
        private readonly positionStore: PositionStore,
        private readonly tradeStore: TradeStore,
        private readonly accountStore: AccountStore
    ) {
        // We instantiate the new feature here
        this.features.push(new PositionLinesFeature());

        // Reactive Update Loop
        $effect(() => {
            if (!this.context || !this.series) return;

            // 1. Update Core Series (Candles)
            // Note: In a full refactor, this moves to MarketDataFeature
            const loaded = this.context.isMarketLoaded;
            const lastCandle = this.context.lastCandle;

            // We still depend on the store trigger for the render loop frequency
            // until we move the loop into ChartHost completely.
            const _trigger = this.marketStore.updateTrigger;

            if (loaded && lastCandle) {
                this.series.update(lastCandle);
            }

            // 2. Update All Plugins
            for (const feature of this.features) {
                feature.update(this.context);
            }

            // 3. Legacy Updates (Fee + Current Price)
            // These will be moved to plugins in the next step
            this.renderLegacyComponents();
        });

        // Initial Data Load Effect
        $effect(() => {
            const loaded = this.marketStore.isLoaded;
            const history = this.marketStore.history;
            if (this.series && loaded && history.length > 0) {
                this.series.setData(history);
            }
        });
    }

    init(chart: IChartApi, series: ISeriesApi<"Candlestick">, context: ChartContext) {
        this.chart = chart;
        this.series = series;
        this.context = context;
        this.formatter = new LineTitleFormatter(context.activeSymbol);

        // Mount Features
        for (const feature of this.features) {
            feature.mount(chart, series);
        }

        // Init Legacy
        this.initPrimitives();

        // Initial Render
        if (this.marketStore.isLoaded && this.marketStore.history.length > 0) {
            this.series.setData(this.marketStore.history);
        }
    }

    destroy() {
        for (const feature of this.features) {
            feature.destroy();
        }

        // Clean legacy
        if (this.series && this.feePrimitive) {
            this.series.detachPrimitive(this.feePrimitive);
        }
        if (this.series && this.currentPriceLine) {
            this.series.removePriceLine(this.currentPriceLine);
        }

        this.chart = null;
        this.series = null;
    }

    // --- Legacy Methods (Temporary Preservation) ---

    private initPrimitives() {
        if (!this.series || !this.context?.marketDetails) return;

        if (this.feePrimitive) {
            this.series.detachPrimitive(this.feePrimitive);
            this.feePrimitive = null;
        }

        const feeData = this.context.marketDetails.instrument.overnightFee;
        const timestampMs = feeData?.swapChargeTimestamp;

        if (timestampMs) {
            const timestampSeconds = Math.floor(timestampMs / 1000);
            const fmt = DateTime.fromMillis(timestampMs).toFormat("HH:mm");
            this.feePrimitive = new FeeLinePrimitive(timestampSeconds, fmt, "Fee: —");
            this.series.attachPrimitive(this.feePrimitive);
        }
    }

    private renderLegacyComponents() {
        if (!this.series || !this.context || !this.formatter) return;

        const currentPrice = this.context.currentPrice;
        const position = this.context.activePosition;

        // 1. Current Price Line
        this.updateCurrentPriceLine(position, currentPrice);

        // 2. Fee Label
        const feeLabel = this.calculateFee(currentPrice, position);
        if (this.feePrimitive) {
            this.feePrimitive.update(this.feePrimitive.timestamp, this.feePrimitive.formattedTime, feeLabel);
        }
    }

    private updateCurrentPriceLine(response: any, currentPrice: number) {
        if (!this.series || !this.formatter) return;

        if (!response || currentPrice === 0) {
            if (this.currentPriceLine) {
                this.series.applyOptions({
                    priceLineVisible: false,
                    title: BASE_SERIES_TITLE
                });
                this.series.removePriceLine(this.currentPriceLine);
                this.currentPriceLine = null;
            }
            return;
        }

        const position = response.position;
        const initialBalance = position.initialBalance || 0;
        const isLandscape = this.context!.viewportWidth > this.context!.viewportHeight;

        // Re-using logic from external helper
        const data = calculateCurrentPriceLine(
            position,
            currentPrice,
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

    private calculateFee(price: number, position: any): string {
        if (!position || !this.context?.marketDetails || price <= 0) return "Fee: —";
        const feeData = this.context.marketDetails.instrument.overnightFee;
        if (!feeData) return "Fee: —";
        const size = position.position.size;
        const isBuy = position.position.direction === TRADING.BUY_DIRECTION;
        const rate = isBuy ? feeData.longRate : feeData.shortRate;
        const rawFee = (size * price * rate) / 100;
        const symbol = this.context.activeSymbol || "$";
        const formattedFee = Math.abs(rawFee).toFixed(2);
        const sign = rawFee >= 0 ? "+" : "-";
        return `${sign}${symbol}${formattedFee}`;
    }
}