import type { ISeriesApi, MouseEventParams } from 'lightweight-charts';

// Define a simpler event for the handler
export interface ChartClickEvent {
    price: number;
    time: number | null; // Coordinate to time might return null
}

export class ChartInputHandler {
    private series: ISeriesApi<"Candlestick"> | null = null;

    constructor(
        private readonly onClick: (event: ChartClickEvent) => void,
        private readonly isBlocked: () => boolean
    ) {}

    configure(series: ISeriesApi<"Candlestick">) {
        this.series = series;
    }

    handleChartClick = (param: MouseEventParams) => {
        if (this.isBlocked()) return;
        if (!this.series) return;
        if (!param.point) return;

        const price = this.series.coordinateToPrice(param.point.y);
        if (!price) return;

        // Optional: Extract time if needed later
        // const time = param.time ? Number(param.time) : null;

        this.onClick({
            price,
            time: null
        });
    };
}