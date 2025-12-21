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
                padding: 0 0.25rem;
                width: 2rem;
                color: #d1d4dc;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 4rem; /* Increased height */
                border-left: 4px solid {overlay.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
            "
        >
            {#if overlay.isOpen}
                <span style="font-size: 0.6rem;">◀</span>
            {:else}
                <span style="font-size: 0.6rem;">▶</span>
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
                    max-width: 85vw;
                "
            >
                <!-- 1. Market Name -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => goto('/instrument')}
                        onkeydown={(e) => e.key === 'Enter' && goto('/instrument')}
                        style="
                        padding: 0.25rem 0.5rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        border-right: 1px solid #444;
                        max-width: 100px; /* Constrain width to force wrap */
                    "
                >
                    <div style="font-size: 0.8rem; font-weight: bold; line-height: 1.1; word-wrap: break-word;">
                        {overlay.marketName}
                    </div>
                </div>

                <!-- 2. Account Info (Mode + Name + Deposit) -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => goto('/accounts')}
                        onkeydown={(e) => e.key === 'Enter' && goto('/accounts')}
                        style="
                        padding: 0.25rem 0.5rem;
                        cursor: pointer;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        border-right: 1px solid #444;
                        min-width: 90px;
                        max-width: 140px;
                    "
                >
                    <div style="
                        font-size: 0.6rem;
                        font-weight: 900;
                        letter-spacing: 1px;
                        color: {overlay.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
                        margin-bottom: 2px;
                    ">
                        {overlay.mode}
                    </div>
                    <div style="
                        font-weight: bold;
                        margin-bottom: 2px;
                        color: #ccc;
                        font-size: 0.7rem;
                        line-height: 1;
                        word-wrap: break-word;
                    ">
                        {overlay.account.accountName}
                    </div>
                    <div style="font-weight: bold; font-size: 0.9rem; color: #fff;">
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
                            padding: 0.25rem 0.5rem;
                            cursor: pointer;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            border-right: 1px solid #444;
                            min-width: 60px;
                        "
                    >
                        <div style="font-weight: bold; margin-bottom: 0.1rem; color: #ddd; font-size: 0.65rem;">
                            Position
                        </div>
                        <div style="
                            font-weight: bold;
                            font-size: 0.85rem;
                            line-height: 1.1;
                            color: {overlay.position.position.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}
                        ">
                            {overlay.position.position.direction}<br>{overlay.position.position.size}
                        </div>
                    </div>

                    <button
                            onclick={() => overlay.closePosition()}
                            disabled={overlay.isClosing}
                            style="
                            background: {overlay.isClosing ? '#444' : '#ef5350'};
                            border: none;
                            color: white;
                            padding: 0 0.5rem;
                            cursor: pointer;
                            font-weight: bold;
                            border-top-right-radius: 8px;
                            border-bottom-right-radius: 8px;
                            font-size: 0.8rem;
                            width: 60px; /* Force wrap */
                            line-height: 1.1;
                            white-space: normal;
                        "
                    >
                        {overlay.isClosing ? 'Closing...' : 'Close Position'}
                    </button>
                {/if}
            </div>
        {/if}
    </div>
{/if}