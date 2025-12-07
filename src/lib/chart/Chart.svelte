<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { createChart } from 'lightweight-charts';
    import type { IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
    import * as CHART from '$lib/constants/chart.js';
    import * as EVENT from '$lib/constants/events.js';
    import * as HELPER from "$lib/utils/helpers.js";
    import {getOptions} from "$lib/chart/options.js";

    let chart: IChartApi | null = null;
    let series: ISeriesApi<"Candlestick"> | null = null;

    function handleResize() {
        if (!chart) return;
        const { width, height } = HELPER.getStoredDimensions();
        chart.applyOptions({ width, height });
    }

    onMount(async () => {
        const container = document.getElementById(CHART.CHART_CONTAINER_ID);
        if (!container) return;

        const { width, height } = HELPER.getStoredDimensions();
        chart = createChart(container, getOptions(width, height));

        HELPER.removeTradingViewLogo();

        series = null; // how to add this in chart v5? search google for how

        const res = await fetch(CHART.CHART_CANDLES_ENDPOINT);
        const data = await res.json() as { prices: CandlestickData[]};

        if (series) {
            series.setData(data.prices);
        }

        window.addEventListener(EVENT.WINDOW_RESIZE, handleResize);
        window.addEventListener(EVENT.WINDOW_ORIENTATION_CHANGE, handleResize);
    });

    onDestroy(() => {
        if (chart) {
            chart.remove();
        }
        window.removeEventListener(EVENT.WINDOW_RESIZE, handleResize);
        window.removeEventListener(EVENT.WINDOW_ORIENTATION_CHANGE, handleResize);
    });
</script>

<div id={CHART.CHART_CONTAINER_ID}></div>

<style>
    div {
        position: relative;
        padding: 0;
        margin: 0;
        overflow: hidden;
    }
</style>