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
        <!-- The Toggle Arrow -->
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
                min-height: 3.5rem;
                border-left: 4px solid {overlay.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
            "
        >
            {#if overlay.isOpen}
                <span style="font-size: 0.8rem;">◀</span>
            {:else}
                <span style="font-size: 0.8rem;">▶</span>
            {/if}
        </button>

        <!-- The Expanded Data Card -->
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
                    align-items: stretch;
                "
            >
                <!-- 1. Market Name -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => goto('/instrument')}
                        onkeydown={(e) => e.key === 'Enter' && goto('/instrument')}
                        style="
                        padding: 0.5rem 1rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        border-right: 1px solid #444;
                    "
                >
                    <div style="font-size: 1rem; font-weight: bold; white-space: nowrap;">
                        {overlay.marketName}
                    </div>
                </div>

                <!-- 2. Account Info (Name + Deposit) -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => goto('/accounts')}
                        onkeydown={(e) => e.key === 'Enter' && goto('/accounts')}
                        style="
                        padding: 0.5rem 1rem;
                        cursor: pointer;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        font-size: 0.7rem;
                        min-width: 140px;
                        border-right: 1px solid #444;
                    "
                >
                    <div style="font-weight: bold; margin-bottom: 0.25rem; color: #ddd; font-size: 0.75rem;">
                        {overlay.account.accountName}
                    </div>
                    <div style="font-weight: bold; font-size: 1rem; color: #fff;">
                        {overlay.account.symbol}{overlay.account.balance.deposit.toFixed(2)}
                    </div>
                </div>

                <!-- 3. Position Info / Close Button -->
                {#if overlay.position}
                    <div
                            role="button"
                            tabindex="0"
                            onclick={() => goto('/position')}
                            onkeydown={(e) => e.key === 'Enter' && goto('/position')}
                            style="
                            padding: 0.5rem 1rem;
                            cursor: pointer;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            min-width: 100px;
                            border-right: 1px solid #444;
                        "
                    >
                        <div style="font-weight: bold; margin-bottom: 0.25rem; color: #ddd; font-size: 0.75rem;">
                            Position
                        </div>
                        <div style="font-weight: bold; font-size: 1rem; color: {overlay.position.position.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}">
                            {overlay.position.position.direction} {overlay.position.position.size}
                        </div>
                    </div>

                    <button
                            onclick={() => overlay.closePosition()}
                            disabled={overlay.isClosing}
                            style="
                            background: {overlay.isClosing ? '#444' : '#ef5350'};
                            border: none;
                            color: white;
                            padding: 0 1rem;
                            cursor: pointer;
                            font-weight: bold;
                            border-top-right-radius: 8px;
                            border-bottom-right-radius: 8px;
                            white-space: nowrap;
                            font-size: 0.9rem;
                        "
                    >
                        {overlay.isClosing ? 'Closing...' : 'Close Position'}
                    </button>
                {/if}
            </div>
        {/if}
    </div>
{/if}