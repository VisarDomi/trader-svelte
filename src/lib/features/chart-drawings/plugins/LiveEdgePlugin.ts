import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import type { ChartCamera } from "$lib/components/chart-engine/ChartCamera.js";
import type { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";

export class LiveEdgePlugin implements Types {
    id = "live_edge_sensor";

    constructor(private readonly camera: ChartCamera) {}

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {

    }

    update(context: ChartContext): void {
        if (!context.lastCandle) return;

        this.camera.updateAnchor(Number(context.lastCandle.time));
    }

    destroy(): void {

    }
}
