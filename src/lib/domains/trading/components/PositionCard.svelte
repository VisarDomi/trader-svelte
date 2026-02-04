<script lang="ts">
    import * as TRADING from '$lib/shared/constants/trading.js';
    import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
    import type { PositionResponse } from '$lib/shared/types/trading.js';

    let { data } = $props<{ data: PositionResponse }>();

    let pos = $derived(data.position);
    let market = $derived(data.market);
    let isBuy = $derived(pos.direction === TRADING.BUY_DIRECTION);
    let pnlColor = $derived(pos.upl >= 0 ? '#26a69a' : '#ef5350');

    function fmt(val: number | undefined | null) {
        if (val === undefined || val === null) return '—';
        return val.toFixed(2);
    }
</script>

<div class="card">
    <div class="header">
        <div>
            <div class="direction" style="color: {isBuy ? '#26a69a' : '#ef5350'}">
                {pos.direction}
            </div>
            <div class="size">Size: {pos.size}</div>
        </div>
        <div class="pnl-block">
            <div class="label">UNREALIZED P&L</div>
            <div class="pnl-value" style="color: {pnlColor}">
                {pos.upl.toFixed(2)}
            </div>
        </div>
    </div>

    <div class="section">
        <h4 class="section-title">Price Information</h4>
        <div class="grid-2">
            <div class="tile">
                <span class="tile-label">Entry Level</span>
                <div class="tile-val">{fmt(pos.level)}</div>
            </div>
            <div class="tile">
                <span class="tile-label">Current Market (Bid/Ask)</span>
                <div class="tile-val">{fmt(market.bid)} / {fmt(market.offer)}</div>
            </div>
        </div>
    </div>

    <div class="section">
        <h4 class="section-title">Protection</h4>
        <div class="grid-2">
            <div class="tile">
                <span class="tile-label">Stop Loss</span>
                <div class="tile-val" style="color: #ef5350;">{fmt(pos.stopLevel)}</div>
            </div>
            <div class="tile">
                <span class="tile-label">Take Profit</span>
                <div class="tile-val" style="color: #26a69a;">{fmt(pos.profitLevel)}</div>
            </div>
        </div>
    </div>

    <button
            onclick={() => positionStore.close()}
            disabled={positionStore.isClosing}
            class="close-btn"
            style="opacity: {positionStore.isClosing ? 0.5 : 1}"
    >
        {positionStore.isClosing ? 'CLOSING...' : 'CLOSE POSITION'}
    </button>
</div>

<style>
    .card {
        background: #1a1a1a;
        padding: 1.5rem;
        border-radius: 8px;
        border: 1px solid #333;
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid #333;
    }
    .direction { font-size: 2.5rem; font-weight: bold; line-height: 1; }
    .size { font-size: 1.2rem; font-weight: bold; margin-top: 0.5rem; color: #ccc; }

    .pnl-block { text-align: right; }
    .label { font-size: 0.9rem; color: #888; }
    .pnl-value { font-size: 2.5rem; font-weight: bold; line-height: 1; }

    .section-title { color: #666; font-size: 0.8rem; margin-bottom: 1rem; text-transform: uppercase; }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

    .tile { background: #222; padding: 1rem; border-radius: 4px; }
    .tile-label { color: #888; font-size: 0.85rem; }
    .tile-val { font-weight: bold; font-size: 1.2rem; margin-top: 0.25rem; }

    .close-btn {
        width: 100%;
        padding: 1.5rem;
        font-size: 1.2rem;
        font-weight: bold;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        background-color: #444;
        color: white;
        margin-top: 1rem;
    }
</style>