import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { Types } from "$lib/components/chart-engine/types.js";
import { ChartContext } from "$lib/features/chart-orchestration/ChartContext.svelte.js";
import * as CHART from '$lib/shared/constants/chart.js';

export class ClockPlugin implements Types {
    id = "clock_plugin";

    private container: HTMLElement | null = null;
    private clockEl: HTMLDivElement | null = null;
    private interval: ReturnType<typeof setInterval> | null = null;

    mount(chart: IChartApi, series: ISeriesApi<"Candlestick">): void {
        this.container = document.getElementById(CHART.CHART_CONTAINER_ID);
        if (!this.container) return;

        // Ensure container allows absolute positioning of children relative to it
        const currentPos = window.getComputedStyle(this.container).position;
        if (currentPos === 'static') {
            this.container.style.position = 'relative';
        }

        this.clockEl = document.createElement('div');

        // Initial Base Styles
        Object.assign(this.clockEl.style, {
            position: 'absolute',
            right: '20px',
            bottom: '5px', // Default (Portrait/Safe)
            zIndex: '20',
            color: '#777',
            fontSize: '14px',
            fontWeight: 'bold',
            fontFamily: 'Monaco, monospace',
            pointerEvents: 'none',
            userSelect: 'none',
            backgroundColor: 'transparent'
        });

        this.container.appendChild(this.clockEl);
        this.start();
    }

    /**
     * The system passes the context (including viewport dimensions) here.
     * The Clock simply reacts to the provided state rather than calculating it.
     */
    update(context: ChartContext): void {
        if (!this.clockEl) return;

        const isLandscape = context.viewportWidth > context.viewportHeight;

        // Portrait: 20px (Taller scale area)
        // Landscape: 5px (Shorter scale area)
        this.clockEl.style.bottom = isLandscape ? '5px' : '20px';
    }

    destroy(): void {
        if (this.interval) clearInterval(this.interval);

        if (this.clockEl && this.container) {
            if (this.container.contains(this.clockEl)) {
                this.container.removeChild(this.clockEl);
            }
        }
        this.clockEl = null;
        this.container = null;
    }

    private start() {
        const update = () => {
            if (!this.clockEl) return;
            const now = new Date();
            const s = now.getSeconds();
            this.clockEl.innerText = s < 10 ? `0${s}` : `${s}`;
        };

        update();
        // Align next tick to the start of the second for better precision
        const now = new Date();
        const msUntilNextSecond = 1000 - now.getMilliseconds();

        setTimeout(() => {
            update();
            this.interval = setInterval(update, 1000);
        }, msUntilNextSecond);
    }
}