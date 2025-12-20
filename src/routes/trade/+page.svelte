<script lang="ts">
    import { onMount } from 'svelte';
    import { TradeLogic } from './logic.svelte.js';
    import * as AUTH from '$lib/constants/auth.js';
    import * as TRADING from '$lib/constants/trading.js';

    const logic = new TradeLogic();

    onMount(() => {
        logic.init();
    });
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Setup Trade</h1>
        <a href="/chart" style="color: #d1d4dc;">← Cancel</a>
    </div>

    <!-- Active Account Banner -->
    {#if logic.currentAccount}
        <div style="
            margin-bottom: 2rem;
            padding: 1rem;
            background: #262626;
            border-radius: 4px;
            border-left: 4px solid {logic.activeType === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <div>
                <div style="font-weight: bold; font-size: 1.1rem; color: #fff;">
                    {logic.currentAccount.accountName}
                </div>
                <div style="font-size: 0.8rem; margin-top: 0.25rem;">
                    Available: {logic.currentAccount.symbol}{logic.currentAccount.balance.available.toFixed(2)}
                </div>
            </div>
            <div style="font-weight: bold; font-size: 1.2rem; color: {logic.activeType === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'}">
                {logic.activeType}
            </div>
        </div>
    {/if}

    {#if logic.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
            {logic.error}
        </div>
    {/if}

    {#if logic.isLoading}
        <p>Calculating trade parameters...</p>
    {:else if logic.plannedTrade}
        <div style="background: #1a1a1a; padding: 1.5rem; border-radius: 8px; border: 1px solid #333;">
            <h2 style="margin-bottom: 1.5rem; color: #d1d4dc; text-align: center;">Confirm Full Port Trade</h2>

            <div style="
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1rem;
                background: #222;
                padding: 1rem;
                border-radius: 4px;
                margin-bottom: 2rem;
            ">
                <div style="color: #888;">Epic</div>
                <div style="font-weight: bold;">{logic.targetEpic}</div>

                <div style="color: #888;">Direction</div>
                <div style="font-weight: bold; color: {logic.plannedTrade.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}">
                    {logic.plannedTrade.direction}
                </div>

                <div style="color: #888;">Size</div>
                <div style="font-weight: bold; font-size: 1.2rem;">{logic.plannedTrade.size}</div>

                <div style="color: #888;">Entry</div>
                <div>{logic.plannedTrade.entryPrice}</div>

                <div style="color: #888;">Take Profit</div>
                <div style="color: #26a69a; font-weight: bold;">{logic.plannedTrade.profitLevel}</div>

                <div style="color: #888;">Stop Loss</div>
                <div style="color: #ef5350; font-weight: bold;">{logic.plannedTrade.stopLevel}</div>

                <div style="color: #888;">Margin Req</div>
                <div>{logic.plannedTrade.marginRequired.toFixed(2)}</div>
            </div>

            <button
                    onclick={() => logic.confirmTrade()}
                    disabled={logic.isTrading}
                    style="
                width: 100%;
                padding: 1.5rem;
                font-size: 1.5rem;
                font-weight: bold;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                color: white;
                background-color: {logic.plannedTrade.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'};
                opacity: {logic.isTrading ? 0.5 : 1};
            ">
                {logic.isTrading ? 'EXECUTING...' : `CONFIRM ${logic.plannedTrade.direction}`}
            </button>
        </div>
    {/if}
</div>