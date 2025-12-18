<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';

    // Logic Classes
    import { ChartUI } from './ui.svelte.js';
    import { ChartFeed } from './feed.svelte.js';

    // Lib Services/Constants
    import * as STORAGE from '$lib/constants/storage.js';
    import * as TRADING from '$lib/constants/trading.js';
    import * as CHART_CONST from '$lib/constants/chart.js';
    import { authenticateAndStoreSession } from "$lib/services/auth";
    import { DEFAULT_ERROR } from "$lib/constants/error";
    import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart";
    import type { SessionTokens } from "$lib/types/auth";

    // Charting Lib
    import { createChart, CandlestickSeries } from 'lightweight-charts';
    import type { IChartApi } from 'lightweight-charts';

    // State & Config
    let chartContainer: HTMLDivElement;
    let chart: IChartApi;

    const layout = new ChartUI();
    const feed = new ChartFeed();

    const paramEpic = page.url.searchParams.get('epic');
    const epic = paramEpic || TRADING.NDX_EPIC;

    onMount(async () => {
        // 1. URL Consistency
        if (!paramEpic) {
            const newUrl = new URL(page.url);
            newUrl.searchParams.set('epic', epic);
            goto(newUrl, { replaceState: true });
        }

        // 2. Auth Gate
        try {
            await authenticateAndStoreSession();
        } catch (ignore) {
            await goto('/login');
            return;
        }

        // 3. Initialize Chart
        // Use window dims for initial render, layout class will adjust later
        const w = window.innerWidth;
        const h = window.innerHeight;

        chart = createChart(chartContainer, getChartOptions(w, h));
        const series = chart.addSeries(CandlestickSeries, getBaseSeriesOptions(TRADING.NDX_PRICE_PRECISION));

        // 4. Initialize Logic Controllers
        layout.init(chart, chartContainer);

        const tokensData = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (!tokensData) throw new Error(DEFAULT_ERROR);
        const tokens: SessionTokens = JSON.parse(tokensData);

        await feed.init(tokens, epic, series);

        // 5. Signal Ready
        layout.setDataLoaded(true);
    });

    onDestroy(() => {
        layout.destroy();
        feed.destroy();
        if (chart) {
            chart.remove();
        }
    });
</script>

{#if layout.isDataLoaded && layout.isIosDevice}
    <div
            id={CHART_CONST.TOPBAR_ID}
            style="height: {CHART_CONST.TOPBAR_HEIGHT}px; background-color: {CHART_CONST.BACKGROUND_COLOR};"
    >
    </div>
{/if}

<!--
    We bind chartContainer so the logic classes can manipulate it.
    The ID is kept for global CSS/Hack references if needed
-->
<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>