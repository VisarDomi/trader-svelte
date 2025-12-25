import type { ISeriesApi, MouseEventParams } from 'lightweight-charts';
import { bus } from '$lib/stores/bus.js';

export interface ChartClickEvent {
    price: number;
    time: number | null;
}

export class ChartInputHandler {
    private series: ISeriesApi<"Candlestick"> | null = null;

    constructor(
        private readonly isBlocked: () => boolean
    ) {}

    configure(series: ISeriesApi<"Candlestick">) {
        this.series = series;
    }

    handleChartClick = (param: MouseEventParams) => {
        if (this.isBlocked()) return;
        if (!this.series || !param.point) return;

        const price = this.series.coordinateToPrice(param.point.y);
        if (!price) return;

        // Emit to global bus instead of calling a callback
        bus.emit('input:chart_click', {
            price,
            time: param.time ? Number(param.time) : null
        });
    };
}