import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import type { ChartCamera, CameraUpdateAction } from "$lib/components/chart-engine/ChartCamera.js";
import type { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';

export class LiveEdgePlugin implements Types {
    id = "live_edge_sensor";

    private lastLoggedAnchor: number | null = null;

    constructor(private readonly camera: ChartCamera) {}

    mount(_chart: IChartApi, _series: ISeriesApi<"Candlestick">): void {}

    update(context: ChartContext): void {
        if (!context.lastCandle) return;

        const action = this.camera.updateAnchor(Number(context.lastCandle.time));
        this.logAction(action);
    }

    destroy(): void {}

    private logAction(action: CameraUpdateAction | null): void {
        if (!action) return;

        switch (action.kind) {
            case 'enforce':
                if (!action.anchorChanged || action.anchorTime !== this.lastLoggedAnchor) {
                    this.lastLoggedAnchor = action.anchorTime;
                    serverLog({ tag: LogEvent.CameraEnforce, anchorTime: action.anchorTime, rangeFrom: action.rangeFrom, rangeTo: action.rangeTo, span: action.span, anchorChanged: action.anchorChanged });
                }
                break;
        }
    }
}
