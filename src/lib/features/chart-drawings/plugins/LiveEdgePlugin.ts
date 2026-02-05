import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import type { ChartCamera } from "$lib/components/chart-engine/ChartCamera.js";
import type { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";

/**
 * REFACTORED:
 * This plugin is now just a "Sensor".
 * It detects new data and notifies the Camera.
 * It DOES NOT manipulate the chart directly. The Camera owns the Viewport.
 */
export class LiveEdgePlugin implements Types {
    id = "live_edge_sensor";

    constructor(private readonly camera: ChartCamera) {}

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        // No direct subscriptions needed, Camera handles interactions now.
    }

    update(context: ChartContext): void {
        if (!context.lastCandle) return;

        // Simply notify the camera of the current "Live" anchor.
        // The camera decides whether to move the view (Tracking Mode) or ignore it (Browsing Mode).
        this.camera.updateAnchor(Number(context.lastCandle.time));
    }

    destroy(): void {
        // Cleanup if needed
    }
}