import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import type { ChartCamera, CameraAction } from "$lib/components/chart-engine/ChartCamera.js";
import type { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";
import { serverLog, LogEvent } from '$lib/shared/utils/log.js';

export class LiveEdgePlugin implements Types {
    id = "live_edge_sensor";

    /** Gate: only log enforce/passive-follow once per anchor time. */
    private lastLoggedAnchor: number | null = null;

    constructor(private readonly camera: ChartCamera) {}

    mount(_chart: IChartApi, _series: ISeriesApi<"Candlestick">): void {}

    update(context: ChartContext): void {
        if (!context.lastCandle) return;

        const actions = this.camera.updateAnchor(Number(context.lastCandle.time));
        this.logActions(actions);
    }

    destroy(): void {}

    private logActions(actions: CameraAction[]): void {
        for (const action of actions) {
            switch (action.kind) {
                case 'tracking-lost':
                    serverLog({ tag: LogEvent.CameraTrackingLost, drift: action.drift, tolerance: action.tolerance, rangeTo: action.rangeTo, idealTo: action.idealTo });
                    this.lastLoggedAnchor = null;
                    break;

                case 'drift-check':
                    // Only log when drift is non-trivial (user has panned)
                    if (action.drift > 1) {
                        serverLog({ tag: LogEvent.CameraDriftCheck, drift: Math.round(action.drift), tolerance: Math.round(action.tolerance), graceFrames: action.graceFrames, rangeTo: Math.round(action.rangeTo), idealTo: Math.round(action.idealTo) });
                    }
                    break;

                case 'enforce':
                    // Log every enforce when anchor didn't change (within-candle snap = the bug)
                    // Gate by anchorTime only for normal new-candle enforcements
                    if (!action.anchorChanged || action.anchorTime !== this.lastLoggedAnchor) {
                        this.lastLoggedAnchor = action.anchorTime;
                        serverLog({ tag: LogEvent.CameraEnforce, anchorTime: action.anchorTime, rangeFrom: action.rangeFrom, rangeTo: action.rangeTo, span: action.span, anchorChanged: action.anchorChanged });
                    }
                    break;

                case 'passive-follow':
                    if (action.newTime !== this.lastLoggedAnchor) {
                        this.lastLoggedAnchor = action.newTime;
                        serverLog({ tag: LogEvent.CameraPassiveFollow, oldTime: action.oldTime, newTime: action.newTime, delta: action.delta, liveVisible: action.liveVisible });
                    }
                    break;
            }
        }
    }
}
