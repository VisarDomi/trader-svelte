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
            const lineColor = '#E0E0E0'; // Light grey
            const textColor = '#AAAAAA';
            const dashPattern = [4, 4];

            ctx.save();

            // 1. Draw Vertical Dashed Line
            ctx.beginPath();
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1;
            ctx.setLineDash(dashPattern);

            // Snap to pixel grid for crisp lines
            const sharpX = Math.round(this.x as number) + 0.5;

            ctx.moveTo(sharpX, 0);
            ctx.lineTo(sharpX, height);
            ctx.stroke();

            // 2. Draw Labels (Top and Bottom)
            ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';

            // Bottom Label (Time/Date context usually)
            if (this.bottomLabel) {
                ctx.fillText(this.bottomLabel, sharpX, height - 10);
            }

            // Top Label (Description)
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

    update(timestamp: number | null, formattedTime: string) {
        this.timestamp = timestamp;
        this.formattedTime = formattedTime;
        this.requestUpdate();
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

    requestUpdate() {
        // No-op: update logic handled by renderer recreation on next frame
    }
}