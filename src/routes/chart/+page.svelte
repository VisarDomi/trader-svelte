<script lang="ts">
    import { createChart, CandlestickSeries } from 'lightweight-charts';
    import type { IChartApi, ISeriesApi, MouseEventParams } from 'lightweight-charts';
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
    import { getPositions } from "$lib/services/trading.js";
    import { getChartOptions, getBaseSeriesOptions } from "$lib/utils/chart.js";
    import type { SessionTokens } from "$lib/types/auth.js";
    import type { URL_TYPE } from '$lib/types/url.js';

    let chartContainer: HTMLDivElement;
    let chart: IChartApi;
    let series: ISeriesApi<"Candlestick">;

    const layout = new ChartUI();
    const feed = new ChartFeed();
    const overlay = new ChartOverlay();

    let currentEpic = TRADING.NDX_EPIC;
    let decimalPlaces = 2; // Default safe value

    function handleChartClick(param: MouseEventParams) {
        // Need live quotes to decide direction
        if (!param.point || !series || !feed.currentBid || !feed.currentOfr) return;

        const clickPrice = series.coordinateToPrice(param.point.y);
        if (clickPrice === null) return;

        let direction: string | null = null;

        // Momentum logic: Click above Offer = BUY, Click below Bid = SELL
        if (clickPrice > feed.currentOfr) {
            direction = TRADING.BUY_DIRECTION;
        } else if (clickPrice < feed.currentBid) {
            direction = TRADING.SELL_DIRECTION;
        }

        if (direction) {
            const params = new URLSearchParams({
                epic: currentEpic,
                direction: direction,
                price: clickPrice.toFixed(decimalPlaces),
                bid: feed.currentBid.toFixed(decimalPlaces),
                ofr: feed.currentOfr.toFixed(decimalPlaces)
            });
            goto(`/position?${params.toString()}`);
        }
    }

    onMount(async () => {
        try {
            await authenticateAndStoreSession();
        } catch (ignore) {
            await goto('/login');
            return;
        }

        const storedEpic = localStorage.getItem(STORAGE.LAST_EPIC_KEY);
        currentEpic = storedEpic || TRADING.NDX_EPIC;

        const tradingMode = localStorage.getItem(STORAGE.TRADING_MODE_KEY) as URL_TYPE || AUTH.DEMO_TYPE;
        const feedMode = tradingMode === AUTH.REAL_TYPE ? AUTH.REAL_TYPE : AUTH.DEMO_TYPE;
        const tokensKey = feedMode === AUTH.REAL_TYPE ? STORAGE.TOKENS_REAL_KEY : STORAGE.TOKENS_DEMO_KEY;
        const tokensData = localStorage.getItem(tokensKey);

        if (!tokensData) {
            await goto('/login');
            return;
        }
        const tokens: SessionTokens = JSON.parse(tokensData);

        // Fetch Market Info & Positions Parallelly
        let pricePrecision = 100;
        let chartDataSource = TRADING.CHART_DATA_SOURCE_BID;

        try {
            const [marketDetails, positionsResp] = await Promise.all([
                getMarketDetails(feedMode, tokens, currentEpic),
                getPositions(feedMode, tokens)
            ]);

            // 1. Set Precision
            decimalPlaces = marketDetails.snapshot.decimalPlacesFactor;
            pricePrecision = Math.pow(10, decimalPlaces);

            // 2. Determine Chart Source (Bid vs Offer)
            // If SELL position -> Exit is Buy at Offer -> Show Offer chart
            const activePos = positionsResp.positions.find(p => p.market.epic === currentEpic);
            if (activePos && activePos.position.direction === TRADING.SELL_DIRECTION) {
                chartDataSource = TRADING.CHART_DATA_SOURCE_OFR;
            } else {
                chartDataSource = TRADING.CHART_DATA_SOURCE_BID;
            }

        } catch (e) {
            console.error("Failed to fetch initial data", e);
        }

        await overlay.init(currentEpic);

        const w = window.innerWidth;
        const h = window.innerHeight;
        chart = createChart(chartContainer, getChartOptions(w, h));

        chart.subscribeClick(handleChartClick);

        series = chart.addSeries(CandlestickSeries, getBaseSeriesOptions(pricePrecision));

        layout.init(chart, chartContainer);

        // Pass the determined source to the feed
        await feed.init(tokens, currentEpic, series, chartDataSource);

        layout.setDataLoaded(true);
    });

    onDestroy(() => {
        layout.destroy();
        feed.destroy();
        if (chart) {
            chart.unsubscribeClick(handleChartClick);
            chart.remove();
        }
    });
</script>

<TopBar {layout} />
<Overlay {overlay} />

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>