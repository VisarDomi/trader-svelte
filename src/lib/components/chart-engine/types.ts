import type { IChartApi, ISeriesApi } from "lightweight-charts";

export interface Types {

    id: string;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void;

    update(context: any): void;

    destroy(): void;
}
