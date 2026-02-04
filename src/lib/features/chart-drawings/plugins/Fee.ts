import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { DateTime } from 'luxon';
import type { Types } from "$lib/components/chart-engine/types.js";
import { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";
import { Fees } from '$lib/features/chart-drawings/primitives/Fees.js';
import * as TRADING from "$lib/shared/constants/trading.js";
import type { MarketDetailsResponse } from "$lib/shared/types/market.js";

export class Fee implements Types {
    id = "fee_primitive";

    private series: ISeriesApi<"Candlestick"> | null = null;
    private primitive: Fees | null = null;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.series = series;
    }

    update(context: ChartContext): void {
        if (!this.series) return;

        const md = context.marketDetails;
        if (!md) return;

        this.ensurePrimitiveExists(md);
        this.updatePrimitiveLabel(context);
    }

    destroy(): void {
        if (this.series && this.primitive) {
            this.series.detachPrimitive(this.primitive);
            this.primitive = null;
        }
        this.series = null;
    }

    private ensurePrimitiveExists(md: MarketDetailsResponse) {
        if (this.primitive) return;

        const feeData = md.instrument.overnightFee;
        const timestampMs = feeData?.swapChargeTimestamp;

        if (timestampMs) {
            const timestampSeconds = Math.floor(timestampMs / 1000);
            const fmt = DateTime.fromMillis(timestampMs).toFormat("HH:mm");

            this.primitive = new Fees(timestampSeconds, fmt, "Fee: —");
            this.series!.attachPrimitive(this.primitive);
        }
    }

    private updatePrimitiveLabel(context: ChartContext) {
        if (!this.primitive) return;

        const label = this.calculateFee(context);
        this.primitive.update(
            this.primitive.timestamp,
            this.primitive.formattedTime,
            label
        );
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