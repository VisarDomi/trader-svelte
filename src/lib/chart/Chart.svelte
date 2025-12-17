<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import {
        createChart,
        CandlestickSeries,
        type IChartApi,
        type ISeriesApi
    } from 'lightweight-charts';

    // Constants
    import * as CHART from '$lib/constants/chart.js';
    import * as EVENT from '$lib/constants/events.js';
    import * as STORAGE from '$lib/constants/storage.js';
    import * as AUTH_CONST from '$lib/constants/auth.js';
    import * as TRADING from "$lib/constants/trading.js";

    // Helpers & Services
    import * as HELPER from "$lib/utils/helpers.js";
    import { getChartOptions, getSeriesOptions } from "$lib/chart/options.js";
    import { MarketService } from "$lib/services/market.js";
    import type { SessionTokens } from "$lib/types/auth";

    let chart: IChartApi | null = null;
    let series: ISeriesApi<"Candlestick"> | null = null;
    let marketService: MarketService | null = null;

    // --- 1. Resize Handling ---
    function handleResize() {
        if (!chart) return;
        const { width, height } = HELPER.getStoredDimensions();
        // applyOptions is available in IChartApiBase
        chart.applyOptions({ width, height });
    }

    // --- 2. Chart Setup Logic ---
    async function setupChart(container: HTMLElement) {
        // A. Verify Credentials first
        const storedRealTokens = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (!storedRealTokens) {
            console.warn("No REAL tokens found. Please Login to Real environment.");
            return;
        }
        const tokens: SessionTokens = JSON.parse(storedRealTokens);

        // B. Create Chart Instance
        const { width, height } = HELPER.getStoredDimensions();
        chart = createChart(container, getChartOptions(width, height));

        // C. Remove Logo
        HELPER.removeTradingViewLogo();

        // D. Create Series using v5 addSeries + Class Definition
        series = chart.addSeries(
            CandlestickSeries,
            getSeriesOptions(TRADING.BTCUSD_PRICE_PRECISION)
        );

        // E. Initialize Market Data Service
        marketService = new MarketService(series);
        await marketService.initialize(
            TRADING.BTCUSD_EPIC,
            AUTH_CONST.REAL_TYPE,
            tokens
        );

        // F. Event Listeners
        window.addEventListener(EVENT.WINDOW_RESIZE, handleResize);
        window.addEventListener(EVENT.WINDOW_ORIENTATION_CHANGE, handleResize);
    }

    onMount(() => {
        const container = document.getElementById(CHART.CHART_CONTAINER_ID);
        if (container) {
            setupChart(container);
        }
    });

    onDestroy(() => {
        if (marketService) marketService.destroy();
        if (chart) chart.remove();

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
        width: 100%;
        height: 100%;
    }
</style>