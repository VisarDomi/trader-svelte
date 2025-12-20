<script lang="ts">
    import { onMount } from 'svelte';
    import { PositionLogic } from './logic.svelte.js';
    import * as AUTH from '$lib/constants/auth.js';
    import * as TRADING from '$lib/constants/trading.js';

    const logic = new PositionLogic();

    onMount(() => {
        logic.init();
    });
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Trade {logic.targetEpic}</h1>
        <a href="/" style="color: #d1d4dc;">← Back</a>
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
                    {logic.currentAccount.accountName} ({logic.currentAccount.currency})
                </div>
                <div style="font-size: 0.85rem; color: #aaa; margin-top: 0.25rem;">
                    ID: {logic.currentAccount.accountId}
                </div>
                <div style="font-size: 0.8rem; margin-top: 0.5rem; color: {logic.activeType === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'}">
                    {logic.activeType} TRADING MODE
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.85rem; color: #aaa;">Balance</div>
                <div style="font-weight: bold; font-size: 1.1rem;">
                    {logic.currentAccount.symbol}{logic.currentAccount.balance.balance.toFixed(2)}
                </div>
            </div>
        </div>
    {/if}

    {#if logic.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
            {logic.error}
        </div>
    {/if}

    {#if logic.message}
        <div style="color: #26a69a; border: 1px solid #26a69a; padding: 0.5rem; border-radius: 4px; margin-bottom: 1rem;">
            {logic.message}
        </div>
    {/if}

    {#if logic.isLoading}
        <p>Calculating trade parameters...</p>
    {:else}
        <div style="background: #1a1a1a; padding: 2rem; border-radius: 8px; border: 1px solid #333; text-align: center;">

            {#if logic.plannedTrade}
                <!-- CONFIRM FLOW -->
                <div style="margin-bottom: 2rem; text-align: left;">
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
                        <div style="color: #888;">Direction</div>
                        <div style="font-weight: bold; color: {logic.plannedTrade.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}">
                            {logic.plannedTrade.direction}
                        </div>

                        <div style="color: #888;">Size</div>
                        <div style="font-weight: bold; font-size: 1.2rem;">{logic.plannedTrade.size}</div>

                        <div style="color: #888;">Entry (Approx)</div>
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

                    <button
                            onclick={() => window.history.back()}
                            style="
                            width: 100%;
                            margin-top: 1rem;
                            padding: 1rem;
                            background: transparent;
                            border: 1px solid #444;
                            color: #888;
                            border-radius: 8px;
                            cursor: pointer;
                        "
                    >
                        Cancel
                    </button>
                </div>

            {:else if logic.currentPosition}
                <!-- CLOSE FLOW -->
                <div style="margin-bottom: 2rem;">
                    <h2 style="margin-bottom: 1rem; color: #d1d4dc;">Open Position</h2>
                    <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;">
                        <span style="color: {logic.currentPosition.position.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}">
                            {logic.currentPosition.position.direction}
                        </span>
                        <span>{logic.currentPosition.position.size}</span>
                    </div>
                    <div style="color: #888; margin-bottom: 0.5rem;">
                        Entry: {logic.currentPosition.position.level}
                    </div>
                    <div style="font-size: 1.2rem; color: {logic.currentPosition.position.upl >= 0 ? '#26a69a' : '#ef5350'}">
                        P&L: {logic.currentPosition.position.upl.toFixed(2)}
                    </div>
                </div>

                <button
                        onclick={() => logic.closePosition()}
                        disabled={logic.isTrading}
                        style="
                        width: 100%;
                        padding: 1.5rem;
                        font-size: 1.2rem;
                        font-weight: bold;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        background-color: #555;
                        color: white;
                        opacity: {logic.isTrading ? 0.5 : 1};
                    ">
                    {logic.isTrading ? 'CLOSING...' : 'CLOSE POSITION'}
                </button>

            {:else}
                <!-- MANUAL OPEN FLOW -->
                <h2 style="margin-bottom: 2rem; color: #d1d4dc;">Open New Position</h2>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <button
                            onclick={() => logic.openPosition(TRADING.BUY_DIRECTION)}
                            disabled={logic.isTrading}
                            style="
                            padding: 2rem;
                            font-size: 1.5rem;
                            font-weight: bold;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            background-color: #26a69a;
                            color: white;
                            opacity: {logic.isTrading ? 0.5 : 1};
                        ">
                        BUY
                    </button>

                    <button
                            onclick={() => logic.openPosition(TRADING.SELL_DIRECTION)}
                            disabled={logic.isTrading}
                            style="
                            padding: 2rem;
                            font-size: 1.5rem;
                            font-weight: bold;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            background-color: #ef5350;
                            color: white;
                            opacity: {logic.isTrading ? 0.5 : 1};
                        ">
                        SELL
                    </button>
                </div>
                <p style="margin-top: 1rem; color: #666; font-size: 0.8rem;">
                    Default Size: {logic.defaultSize}
                </p>
            {/if}

        </div>
    {/if}
</div>