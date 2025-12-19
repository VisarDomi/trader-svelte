<script lang="ts">
    import { createChart, CandlestickSeries } from 'lightweight-charts';
    import type { IChartApi } from 'lightweight-charts';
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { ChartUI } from './ui.svelte.js';
    import { ChartFeed } from './feed.svelte.js';
    import { ChartOverlay } from './overlay.svelte.js';
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
        const series = chart.addSeries(CandlestickSeries, getBaseSeriesOptions(TRADING.NDX_PRICE_PRECISION));
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

{#if layout.isDataLoaded && layout.isIosDevice}
    <div
            id={CHART_CONST.TOPBAR_ID}
            style="height: {CHART_CONST.TOPBAR_HEIGHT}px; background-color: {CHART_CONST.BACKGROUND_COLOR};"
    >
    </div>
{/if}

<!-- Account Overlay -->
{#if overlay.account}
    <div style="
        position: fixed;
        left: 0;
        top: 1%;
        z-index: 50;
        display: flex;
        align-items: stretch;
    ">
        <!-- The Data Card (Navigates to accounts) -->
        {#if overlay.isOpen}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
                    role="button"
                    tabindex="0"
                    onclick={(e) => {
                    e.stopPropagation();
                    goto('/accounts');
                }}
                    onkeydown={(e) => {
                    if (e.key === 'Enter') {
                        e.stopPropagation();
                        goto('/accounts');
                    }
                }}
                    style="
                    background: rgba(20, 20, 20, 0.9);
                    backdrop-filter: blur(4px);
                    border: 1px solid #333;
                    border-left: none;
                    border-top-right-radius: 8px;
                    border-bottom-right-radius: 8px;
                    padding: 0.75rem 1rem;
                    color: white;
                    text-align: left;
                    cursor: pointer;
                    box-shadow: 4px 0 10px rgba(0,0,0,0.5);
                    border-left: 4px solid {overlay.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                "
            >
                <!-- Market Name -->
                <div style="font-size: 1rem; font-weight: bold; white-space: nowrap;">
                    {overlay.marketName}
                </div>

                <!-- Vertical Separator -->
                <div style="width: 1px; height: 24px; background: #444;"></div>

                <!-- Account Info -->
                <div style="display: flex; flex-direction: column; justify-content: center; line-height: 1.2;">
                    <div style="font-size: 0.75rem; color: #ddd;">
                        {overlay.account.accountName} <span style="font-size: 0.65rem; color: #aaa;">({overlay.mode})</span>
                    </div>
                    <div style="font-size: 0.9rem; font-weight: bold;">
                        {overlay.account.symbol}{overlay.account.balance.balance.toFixed(2)}
                    </div>
                </div>
            </div>
        {/if}

        <!-- The Toggle Arrow -->
        <button
                onclick={(e) => {
                e.stopPropagation();
                overlay.toggle();
            }}
                style="
                background: rgba(40, 40, 40, 0.9);
                border: 1px solid #333;
                border-left: none;
                border-top-right-radius: 8px;
                border-bottom-right-radius: 8px;
                padding: 0 0.5rem;
                color: #d1d4dc;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-left: -1px; /* Overlap border */
                min-height: 40px; /* Ensure touch target size */
            "
        >
            {#if overlay.isOpen}
                <span style="font-size: 0.8rem;">◀</span>
            {:else}
                <span style="font-size: 0.8rem;">▶</span>
            {/if}
        </button>
    </div>
{/if}

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>