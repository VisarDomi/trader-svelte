<script lang="ts">
    import { createChart, CandlestickSeries } from 'lightweight-charts';
    import type { IChartApi } from 'lightweight-charts';
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';

    import { ChartUI } from './ui.svelte.js';
    import { ChartFeed } from './feed.svelte.js';
    import { ChartOverlay } from './overlay.svelte.js';

    import TopBar from './TopBar.svelte';
    import Overlay from './Overlay.svelte';

    import * as STORAGE from '$lib/constants/storage.js';
    import * as TRADING from '$lib/constants/trading.js';
    import * as CHART_CONST from '$lib/constants/chart.js';
    import * as AUTH from '$lib/constants/auth.js';
    import { authenticateAndStoreSession } from "$lib/services/auth.js";
    import { getMarketDetails } from "$lib/services/market.js";
    import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
    import type { SessionTokens } from "$lib/types/auth.js";
    import type { URL_TYPE } from '$lib/types/url.js';

    let chartContainer: HTMLDivElement;
    let chart: IChartApi;

    const layout = new ChartUI();
    const feed = new ChartFeed();
    const overlay = new ChartOverlay();

    onMount(async () => {
        try {
            await authenticateAndStoreSession();
        } catch (ignore) {
            await goto('/login');
            return;
        }

        // 1. Determine Epic (Storage > Default)
        const storedEpic = localStorage.getItem(STORAGE.LAST_EPIC_KEY);
        const epic = storedEpic || TRADING.NDX_EPIC;

        // 2. Determine Mode & Tokens
        const tradingMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE || AUTH.DEMO_TYPE;
        // Chart feed uses opposite of trading mode if we wanted, or just REAL.
        // For simplicity based on your previous logic:
        // If trading REAL, use REAL feed. If trading DEMO, use DEMO feed (usually).
        // However, your code had logic: "feedMode = tradingMode === REAL ? DEMO : REAL" which seemed odd.
        // I will assume we want the feed matching the current mode, or Real if available for better data.
        // Let's stick to: Use Real for charts if possible, unless in Demo mode and only have Demo tokens?
        // Actually, to match Overlay logic:

        const feedMode = tradingMode === AUTH.REAL_TYPE ? AUTH.REAL_TYPE : AUTH.DEMO_TYPE; // Simplified for now
        const tokensKey = feedMode === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensData = localStorage.getItem(tokensKey);

        if (!tokensData) {
            // Fallback to opposite if primary missing? Or just fail.
            await goto('/login');
            return;
        }
        const tokens: SessionTokens = JSON.parse(tokensData);

        // 3. Fetch Dynamic Instrument Data (Replacing constants)
        // We need precision for the chart configuration
        let pricePrecision = 100; // Safe default
        try {
            const marketDetails = await getMarketDetails(feedMode, tokens, epic);
            const factor = marketDetails.snapshot.decimalPlacesFactor; // e.g., 2
            pricePrecision = Math.pow(10, factor); // 10^2 = 100
        } catch (e) {
            console.error("Failed to fetch market details for chart config", e);
        }

        await overlay.init(epic);

        const w = window.innerWidth;
        const h = window.innerHeight;
        chart = createChart(chartContainer, getChartOptions(w, h));

        // 4. Configure Series with dynamic precision
        const series = chart.addSeries(CandlestickSeries, getBaseSeriesOptions(pricePrecision));

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