import {
    type ISeriesPrimitive,
    type SeriesAttachedParameter,
    type IPrimitivePaneRenderer,
    type IPrimitivePaneView,
    type PrimitivePaneViewZOrder,
    type Time
} from 'lightweight-charts';

// Shim for the fancy-canvas type used by lightweight-charts internal renderer
interface CanvasRenderingTarget2D {
    useMediaCoordinateSpace: (
        callback: (scope: {
            context: CanvasRenderingContext2D;
            mediaSize: { width: number; height: number }
        }) => void
    ) => void;
}

class FeeLineRenderer implements IPrimitivePaneRenderer {
    constructor(
        private readonly x: number | null,
        private readonly bottomLabel: string,
        private readonly topLabel: string
    ) {}

    draw(target: CanvasRenderingTarget2D) {
        if (this.x === null) return;

        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            const height = mediaSize.height;

            // Visual Configuration
            const lineColor = '#FF1744'; // Vivid Red
            const textColor = '#FF1744';
            const dashPattern: number[] = []; // Solid line

            ctx.save();

            // 1. Draw Vertical Line
            ctx.beginPath();
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 2; // Matching standard line thickness
            ctx.setLineDash(dashPattern);

            // Snap to pixel grid for crisp lines
            const sharpX = Math.round(this.x as number) + 0.5;

            ctx.moveTo(sharpX, 0);
            ctx.lineTo(sharpX, height);
            ctx.stroke();

            // 2. Draw Labels
            ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';

            // Bottom Label (Time)
            if (this.bottomLabel) {
                ctx.fillText(this.bottomLabel, sharpX, height - 10);
            }

            // Top Label (Fee Amount)
            if (this.topLabel) {
                ctx.fillText(this.topLabel, sharpX, 20);
            }

            ctx.restore();
        });
    }
}

class FeeLinePaneView implements IPrimitivePaneView {
    constructor(
        private readonly source: FeeLinePrimitive
    ) {}

    zOrder(): PrimitivePaneViewZOrder {
        return 'bottom';
    }

    renderer(): IPrimitivePaneRenderer {
        const time = this.source.timestamp;
        const chart = this.source.chart;

        let x: number | null = null;

        if (time && chart) {
            // Convert time to pixel coordinate
            x = chart.timeScale().timeToCoordinate(time as Time);
        }

        return new FeeLineRenderer(
            x,
            this.source.formattedTime,
            this.source.label
        );
    }
}

export class FeeLinePrimitive implements ISeriesPrimitive<Time> {
    public chart: SeriesAttachedParameter['chart'] | null = null;
    private _paneViews: FeeLinePaneView[] = [];

    constructor(
        public timestamp: number | null,
        public formattedTime: string,
        public label: string = "OVERNIGHT FEE"
    ) {
        this._paneViews = [new FeeLinePaneView(this)];
    }

    update(timestamp: number | null, formattedTime: string, label: string) {
        this.timestamp = timestamp;
        this.formattedTime = formattedTime;
        this.label = label;
        // In lightweight-charts, changing properties usually requires a redraw request
        // We don't have direct access to requestUpdate() on the chart here easily without storing params,
        // but since this is usually called inside the chart's update loop/reactivity,
        // the re-render of the chart often picks it up.
    }

    // --- ISeriesPrimitive Implementation ---

    attached(param: SeriesAttachedParameter<Time>): void {
        this.chart = param.chart;
    }

    detached(): void {
        this.chart = null;
    }

    paneViews(): readonly IPrimitivePaneView[] {
        return this._paneViews;
    }
}