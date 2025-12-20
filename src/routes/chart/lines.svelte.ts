import type { ISeriesApi, IPriceLine } from "lightweight-charts";
import type { PositionResponse } from "$lib/types/trading.js";
import * as TRADING from "$lib/constants/trading.js";

export class ChartLines {
    private series: ISeriesApi<"Candlestick"> | null = null;
    private entryLine: IPriceLine | null = null;
    private tpLine: IPriceLine | null = null;
    private slLine: IPriceLine | null = null;

    init(series: ISeriesApi<"Candlestick">) {
        this.series = series;
    }

    update(position: PositionResponse | null) {
        if (!this.series) return;

        // Always clear existing lines first
        this.clear();

        if (!position) return;

        const p = position.position;

        // 1. Entry Line
        this.entryLine = this.series.createPriceLine({
            price: p.level,
            color: '#d1d4dc', // White/Gray
            lineWidth: 1,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: `${p.direction} @ ${p.level}`,
        });

        // 2. Take Profit
        if (p.profitLevel) {
            this.tpLine = this.series.createPriceLine({
                price: p.profitLevel,
                color: '#26a69a', // Green
                lineWidth: 1,
                lineStyle: 0, // Solid
                axisLabelVisible: true,
                title: 'TP',
            });
        }

        // 3. Stop Loss
        if (p.stopLevel) {
            this.slLine = this.series.createPriceLine({
                price: p.stopLevel,
                color: '#ef5350', // Red
                lineWidth: 1,
                lineStyle: 0, // Solid
                axisLabelVisible: true,
                title: 'SL',
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