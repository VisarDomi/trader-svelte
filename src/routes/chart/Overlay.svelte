<script lang="ts">
    import { goto } from '$app/navigation';
    import { onDestroy } from 'svelte';
    import { ChartOverlay } from './overlay.svelte.js';
    import * as AUTH from '$lib/constants/auth.js';
    import * as TRADING from '$lib/constants/trading.js';

    let { overlay }: { overlay: ChartOverlay } = $props();

    onDestroy(() => {
        overlay.destroy();
    });
</script>

{#if overlay.account}
    <div style="
        position: fixed;
        left: 0;
        top: 1%;
        z-index: 50;
        display: flex;
        align-items: stretch;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
        <!-- Toggle Arrow -->
        <button
                onclick={() => overlay.toggle()}
                style="
                background: rgba(30, 30, 30, 0.95);
                border: 1px solid #444;
                border-left: none;
                border-top-right-radius: {overlay.isOpen ? '0' : '8px'};
                border-bottom-right-radius: {overlay.isOpen ? '0' : '8px'};
                padding: 0 0.5rem;
                color: #d1d4dc;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                border-left: 4px solid {overlay.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
            "
        >
            {#if overlay.isOpen}
                <span style="font-size: 0.8rem;">◀</span>
            {:else}
                <span style="font-size: 0.8rem;">▶</span>
            {/if}
        </button>

        <!-- Expanded Content -->
        {#if overlay.isOpen}
            <div
                    style="
                    background: rgba(20, 20, 20, 0.95);
                    backdrop-filter: blur(4px);
                    border: 1px solid #444;
                    border-left: none;
                    border-top-right-radius: 8px;
                    border-bottom-right-radius: 8px;
                    color: white;
                    text-align: left;
                    box-shadow: 4px 0 10px rgba(0,0,0,0.5);
                    display: flex;
                    flex-direction: column;
                    min-width: 200px;
                "
            >
                <!-- Top Header: Market Name -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => goto('/instrument')}
                        onkeydown={(e) => e.key === 'Enter' && goto('/instrument')}
                        style="
                        padding: 0.5rem 1rem;
                        border-bottom: 1px solid #444;
                        font-weight: bold;
                        cursor: pointer;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    "
                >
                    <span>{overlay.marketName}</span>
                    <span style="font-size: 0.7rem; color: #888;">Change</span>
                </div>

                <!-- Account Balances Grid -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => goto('/accounts')}
                        onkeydown={(e) => e.key === 'Enter' && goto('/accounts')}
                        style="
                        padding: 0.75rem 1rem;
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 0.75rem;
                        cursor: pointer;
                        font-size: 0.8rem;
                        border-bottom: 1px solid #444;
                    "
                >
                    <div>
                        <div style="color: #888;">Balance</div>
                        <div>{overlay.account.balance.balance.toFixed(2)}</div>
                    </div>
                    <div>
                        <div style="color: #888;">Deposit</div>
                        <div>{overlay.account.balance.deposit.toFixed(2)}</div>
                    </div>
                    <div>
                        <div style="color: #888;">P&L</div>
                        <div style="color: {overlay.account.balance.profitLoss >= 0 ? '#26a69a' : '#ef5350'}; font-weight: bold;">
                            {overlay.account.balance.profitLoss.toFixed(2)}
                        </div>
                    </div>
                    <div>
                        <div style="color: #888;">Available</div>
                        <div style="color: white;">{overlay.account.balance.available.toFixed(2)}</div>
                    </div>
                </div>

                <!-- Active Position Details (If Exists) -->
                {#if overlay.position}
                    <div
                            role="button"
                            tabindex="0"
                            onclick={() => goto('/position')}
                            onkeydown={(e) => e.key === 'Enter' && goto('/position')}
                            style="
                            padding: 0.75rem 1rem;
                            background: rgba(255, 255, 255, 0.05);
                            cursor: pointer;
                        "
                    >
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                            <div style="font-weight: bold; color: {overlay.position.position.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}">
                                {overlay.position.position.direction} {overlay.position.position.size}
                            </div>
                            <div style="font-weight: bold; color: {overlay.position.position.upl >= 0 ? '#26a69a' : '#ef5350'}">
                                {overlay.position.position.upl.toFixed(2)}
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #aaa;">
                            <span>Entry: {overlay.position.position.level}</span>
                            <span>Lev: 1:{overlay.position.position.leverage}</span>
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}