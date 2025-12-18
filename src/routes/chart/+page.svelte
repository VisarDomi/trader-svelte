<script lang="ts">
    import { createChart, CandlestickSeries } from 'lightweight-charts';
    import type { IChartApi } from 'lightweight-charts';
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { ChartUI } from './ui.svelte.js';
    import { ChartFeed } from './feed.svelte.js';
    import * as STORAGE from '$lib/constants/storage.js';
    import * as API from '$lib/constants/api.js';
    import * as TRADING from '$lib/constants/trading.js';
    import * as CHART_CONST from '$lib/constants/chart.js';
    import { authenticateAndStoreSession } from "$lib/services/auth.js";
    import { DEFAULT_ERROR } from "$lib/constants/error.js";
    import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
    import type { SessionTokens } from "$lib/types/auth.js";

    let chartContainer: HTMLDivElement;
    let chart: IChartApi;

    const layout = new ChartUI();
    const feed = new ChartFeed();

    const paramEpic = page.url.searchParams.get(API.EPIC_KEY);
    const epic = paramEpic || TRADING.NDX_EPIC;

    onMount(async () => {
        if (!paramEpic) {
            const newUrl = new URL(page.url);
            newUrl.searchParams.set(API.EPIC_KEY, epic);
            void goto(newUrl, { replaceState: true });
        }

        try {
            await authenticateAndStoreSession();
        } catch (ignore) {
            await goto('/login');
            return;
        }

        const w = window.innerWidth;
        const h = window.innerHeight;
        chart = createChart(chartContainer, getChartOptions(w, h));
        const series = chart.addSeries(CandlestickSeries, getBaseSeriesOptions(TRADING.NDX_PRICE_PRECISION));
        layout.init(chart, chartContainer);
        const tokensData = localStorage.getItem(STORAGE.TOKENS_REAL_KEY);
        if (!tokensData) throw new Error(DEFAULT_ERROR);
        const tokens: SessionTokens = JSON.parse(tokensData);
        await feed.init(tokens, epic, series);
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

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>