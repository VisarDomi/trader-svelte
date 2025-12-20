<script lang="ts">
    import { createChart, CandlestickSeries } from 'lightweight-charts';
    import type { IChartApi } from 'lightweight-charts';
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';

    import { ChartUI } from './ui.svelte.js';
    import { ChartFeed } from './feed.svelte.js';
    import { ChartOverlay } from './overlay.svelte.js';

    import TopBar from './TopBar.svelte';
    import Overlay from './Overlay.svelte';

    import * as STORAGE from '$lib/constants/storage.js';
    import * as API from '$lib/constants/api.js';
    import * as TRADING from '$lib/constants/trading.js';
    import * as CHART_CONST from '$lib/constants/chart.js';
    import * as AUTH from '$lib/constants/auth.js';
    import { authenticateAndStoreSession } from "$lib/services/auth.js";
    import { DEFAULT_ERROR } from "$lib/constants/error.js";
    import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
    import type { SessionTokens } from "$lib/types/auth.js";
    import type { URL_TYPE } from '$lib/types/url.js';

    let chartContainer: HTMLDivElement;
    let chart: IChartApi;

    const layout = new ChartUI();
    const feed = new ChartFeed();
    const overlay = new ChartOverlay();

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

        await overlay.init(epic);

        const tradingMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE || AUTH.DEMO_TYPE;
        const feedMode = tradingMode === AUTH.REAL_TYPE ? AUTH.DEMO_TYPE : AUTH.REAL_TYPE;
        const tokensKey = feedMode === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensData = localStorage.getItem(tokensKey);

        if (!tokensData) throw new Error(DEFAULT_ERROR);
        const tokens: SessionTokens = JSON.parse(tokensData);

        const w = window.innerWidth;
        const h = window.innerHeight;
        chart = createChart(chartContainer, getChartOptions(w, h));

        const precision = epic === TRADING.BTCUSD_EPIC
            ? TRADING.BTCUSD_PRICE_PRECISION
            : TRADING.NDX_PRICE_PRECISION;

        const series = chart.addSeries(CandlestickSeries, getBaseSeriesOptions(precision));
        layout.init(chart, chartContainer);

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

<TopBar {layout} />
<Overlay {overlay} />

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>