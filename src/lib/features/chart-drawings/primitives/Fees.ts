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

const FEE_LINE_COLOR = '#FF5252'; // Lighter, distinct red
const FEE_TEXT_COLOR = '#FFFFFF';

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

            ctx.save();

            // 1. Draw Vertical Line
            ctx.beginPath();
            ctx.strokeStyle = FEE_LINE_COLOR;
            ctx.lineWidth = 2;
            const dashPattern: number[] = [];
            ctx.setLineDash(dashPattern); // no dash

            const sharpX = Math.round(this.x as number) + 0.5;

            ctx.moveTo(sharpX, 0);
            ctx.lineTo(sharpX, height);
            ctx.stroke();

            // 2. Draw Labels
            ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Draw Bottom Label (Time)
            if (this.bottomLabel) {
                this.drawLabel(ctx, this.bottomLabel, sharpX, height - 20);
            }

            // Draw Top Label (Fee Amount)
            if (this.topLabel) {
                this.drawLabel(ctx, this.topLabel, sharpX, 20);
            }

            ctx.restore();
        });
    }

    private drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
        const paddingX = 6;
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        const boxHeight = 20;
        const boxWidth = textWidth + (paddingX * 2);

        const left = x - (boxWidth / 2);
        const top = y - (boxHeight / 2);

        // Background Box (Rounded Rectangle)
        ctx.fillStyle = FEE_LINE_COLOR;
        ctx.beginPath();
        const r = 4; // corner radius
        ctx.moveTo(left + r, top);
        ctx.lineTo(left + boxWidth - r, top);
        ctx.quadraticCurveTo(left + boxWidth, top, left + boxWidth, top + r);
        ctx.lineTo(left + boxWidth, top + boxHeight - r);
        ctx.quadraticCurveTo(left + boxWidth, top + boxHeight, left + boxWidth - r, top + boxHeight);
        ctx.lineTo(left + r, top + boxHeight);
        ctx.quadraticCurveTo(left, top + boxHeight, left, top + boxHeight - r);
        ctx.lineTo(left, top + r);
        ctx.quadraticCurveTo(left, top, left + r, top);
        ctx.fill();

        // Text
        ctx.fillStyle = FEE_TEXT_COLOR;
        ctx.fillText(text, x, y + 1); // +1 for visual vertical alignment
    }
}

class FeeLinePaneView implements IPrimitivePaneView {
    constructor(
        private readonly source: Fees
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

export class Fees implements ISeriesPrimitive {
    public chart: SeriesAttachedParameter['chart'] | null = null;
    private readonly _paneViews: FeeLinePaneView[] = [];

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
    }

    // --- ISeriesPrimitive Implementation ---

    attached(param: SeriesAttachedParameter): void {
        this.chart = param.chart;
    }

    detached(): void {
        this.chart = null;
    }

    paneViews(): readonly IPrimitivePaneView[] {
        return this._paneViews;
    }
}