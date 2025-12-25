import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { DateTime } from 'luxon';
import type { ChartFeature } from "$lib/core/ChartFeature.js";
import { ChartContext } from "$lib/features/chart/ChartContext.svelte.js";
import { FeeLinePrimitive } from '$lib/presentation/primitives/FeeLinePrimitive.js';
import * as TRADING from "$lib/constants/trading.js";

export class FeePrimitiveFeature implements ChartFeature {
    id = "fee_primitive";

    private series: ISeriesApi<"Candlestick"> | null = null;
    private primitive: FeeLinePrimitive | null = null;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.series = series;
    }

    update(context: ChartContext): void {
        if (!this.series) return;

        const md = context.marketDetails;
        if (!md) return;

        // 1. Initialize if needed
        if (!this.primitive) {
            const feeData = md.instrument.overnightFee;
            const timestampMs = feeData?.swapChargeTimestamp;

            if (timestampMs) {
                const timestampSeconds = Math.floor(timestampMs / 1000);
                const fmt = DateTime.fromMillis(timestampMs).toFormat("HH:mm");

                this.primitive = new FeeLinePrimitive(timestampSeconds, fmt, "Fee: —");
                this.series.attachPrimitive(this.primitive);
            }
        }

        // 2. Update Label
        if (this.primitive) {
            const label = this.calculateFee(context);
            this.primitive.update(
                this.primitive.timestamp,
                this.primitive.formattedTime,
                label
            );
        }
    }

    destroy(): void {
        if (this.series && this.primitive) {
            this.series.detachPrimitive(this.primitive);
            this.primitive = null;
        }
        this.series = null;
    }

    private calculateFee(context: ChartContext): string {
        const position = context.activePosition;
        const price = context.currentPrice;
        const md = context.marketDetails;

        if (!position || !md || price <= 0) return "Fee: —";

        const feeData = md.instrument.overnightFee;
        if (!feeData) return "Fee: —";

        const size = position.position.size;
        const isBuy = position.position.direction === TRADING.BUY_DIRECTION;

        const rate = isBuy ? feeData.longRate : feeData.shortRate;
        const rawFee = (size * price * rate) / 100;

        const symbol = context.activeSymbol || "$";
        const formattedFee = Math.abs(rawFee).toFixed(2);
        const sign = rawFee >= 0 ? "+" : "-";

        return `${sign}${symbol}${formattedFee}`;
    }
}