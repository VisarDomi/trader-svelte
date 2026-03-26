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

        const currentPos = window.getComputedStyle(this.container).position;
        if (currentPos === 'static') {
            this.container.style.position = 'relative';
        }

        this.clockEl = document.createElement('div');

        Object.assign(this.clockEl.style, {
            position: 'absolute',
            right: '20px',
            bottom: '5px',
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

    update(context: ChartContext): void {
        if (!this.clockEl) return;

        const isLandscape = context.viewportWidth > context.viewportHeight;

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

        const now = new Date();
        const msUntilNextSecond = 1000 - now.getMilliseconds();

        setTimeout(() => {
            update();
            this.interval = setInterval(update, 1000);
        }, msUntilNextSecond);
    }
}
