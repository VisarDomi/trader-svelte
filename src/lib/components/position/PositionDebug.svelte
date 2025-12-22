<script lang="ts">
    import { viewport } from '$lib/services/viewport.svelte.js';
    import { accountStore } from '$lib/stores/account.svelte.js';
    import * as TRADING from '$lib/constants/trading.js';

    // Reuse the Presentation Logic from Step 1
    import { EntryLine } from '$lib/presentation/lines/EntryLine.js';
    import { StopLossLine } from '$lib/presentation/lines/StopLossLine.js';
    import { TakeProfitLine } from '$lib/presentation/lines/TakeProfitLine.js';
    import { CurrentPriceLine } from '$lib/presentation/lines/CurrentPriceLine.js';

    import type { PositionResponse } from '$lib/types/trading.js';

    let { positionResponse } = $props<{ positionResponse: PositionResponse }>();

    let debugInfo = $derived.by(() => {
        const p = positionResponse.position;
        const m = positionResponse.market;
        const initialBalance = p.initialBalance || 0;
        const isLandscape = viewport.width > viewport.height;
        const symbol = accountStore.activeSymbol;

        // Current Price Logic
        const currentPrice = p.direction === TRADING.BUY_DIRECTION ? m.bid : m.offer;

        // Instantiate Presenters
        const entry = new EntryLine(p, m.epic);
        const sl = new StopLossLine(p, initialBalance, symbol);
        const tp = new TakeProfitLine(p, initialBalance, symbol);
        const current = new CurrentPriceLine(p, currentPrice, initialBalance, symbol);

        return {
            starting: entry.getData(isLandscape),
            wendy: sl.getData(isLandscape),
            lambo: tp.getData(isLandscape),
            current: current.getData(isLandscape),
            initialBalance
        };
    });
</script>

<div class="debug-container">
    <div class="header">
        <h4 class="title">[DEBUG] CHART LINES</h4>
        <span class="sub">Initial Bal: {debugInfo.initialBalance.toFixed(2)}</span>
    </div>

    <div class="lines-list">
        <!-- LAMBO (TP) -->
        {#if debugInfo.lambo}
            <div class="line-item" style="border-color: {debugInfo.lambo.color}; color: {debugInfo.lambo.color};">
                <strong>LAMBO (TP):</strong> {debugInfo.lambo.price}
                <div class="line-title">{debugInfo.lambo.title}</div>
            </div>
        {:else}
            <div class="line-item empty">LAMBO (TP): Not Set</div>
        {/if}

        <!-- CURRENT -->
        {#if debugInfo.current}
            <div class="line-item" style="border-color: {debugInfo.current.color}; color: {debugInfo.current.color};">
                <strong>CURRENT:</strong> {debugInfo.current.price}
                <div class="line-title">{debugInfo.current.title}</div>
            </div>
        {/if}

        <!-- STARTING -->
        {#if debugInfo.starting}
            <div class="line-item" style="border-color: {debugInfo.starting.color}; color: {debugInfo.starting.color};">
                <strong>STARTING:</strong> {debugInfo.starting.price}
                <div class="line-title">{debugInfo.starting.title}</div>
            </div>
        {/if}

        <!-- WENDY (SL) -->
        {#if debugInfo.wendy}
            <div class="line-item" style="border-color: {debugInfo.wendy.color}; color: {debugInfo.wendy.color};">
                <strong>WENDY (SL):</strong> {debugInfo.wendy.price}
                <div class="line-title">{debugInfo.wendy.title}</div>
            </div>
        {:else}
            <div class="line-item empty">WENDY (SL): Not Set</div>
        {/if}
    </div>
</div>

<style>
    .debug-container {
        background: #220033;
        padding: 1rem;
        border: 1px dashed #ff00ff;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.85rem;
        color: #ffccff;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    .title { color: #ff00ff; font-weight: bold; margin: 0; }
    .sub { color: #aaa; }
    .lines-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .line-item { border: 1px solid; padding: 0.5rem; }
    .line-item.empty { border: 1px solid #444; color: #666; }
    .line-title { color: #ccc; }
</style>