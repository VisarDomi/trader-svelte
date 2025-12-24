import {
    type ISeriesPrimitive,
    type SeriesAttachedParameter,
    type IPrimitivePaneRenderer,
    type IPrimitivePaneView,
    type PrimitivePaneViewZOrder,
    type Time
} from 'lightweight-charts';

class FeeLineRenderer implements IPrimitivePaneRenderer {
    constructor(
        private readonly x: number | null,
        private readonly bottomLabel: string,
        private readonly topLabel: string
    ) {}

    draw(target: CanvasRenderingTarget2D) {
        if (this.x === null) return;

        const ctx = target.context;
        const height = target.mediaSize.height;

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
        ctx.moveTo(this.x, 0);
        ctx.lineTo(this.x, height);
        ctx.stroke();

        // 2. Draw Labels (Top and Bottom)
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';

        // Bottom Label (Time/Date context usually)
        if (this.bottomLabel) {
            ctx.fillText(this.bottomLabel, this.x, height - 10);
        }

        // Top Label (Description)
        if (this.topLabel) {
            ctx.fillText(this.topLabel, this.x, 20);
        }

        ctx.restore();
    }
}

class FeeLinePaneView implements IPrimitivePaneView {
    constructor(
        private readonly source: FeeLinePrimitive
    ) {}

    zOrder(): PrimitivePaneViewZOrder {
        return 'bottom'; // Draw behind candles so it doesn't obscure price action
    }

    renderer(): IPrimitivePaneRenderer {
        const time = this.source.timestamp;
        const chart = this.source.chart;

        let x: number | null = null;

        if (time && chart) {
            // Convert time to pixel coordinate
            // Returns null if the time is not currently visible or valid in the scale
            x = chart.timeScale().timeToCoordinate(time as Time);
        }

        return new FeeLineRenderer(
            x,
            this.source.formattedTime,
            "OVERNIGHT FEE"
        );
    }
}

export class FeeLinePrimitive implements ISeriesPrimitive<Time> {
    public chart: SeriesAttachedParameter['chart'] | null = null;
    private _paneViews: FeeLinePaneView[] = [];

    constructor(
        public timestamp: number | null,
        public formattedTime: string
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
        if (this.chart) {
            // We cannot easily call requestUpdate on the chart from here directly without storing the callback
            // But usually simply returning a new state in renderer() is enough when the chart redraws.
            // To force a redraw, we might need to rely on external triggers or interaction.
        }
    }
}