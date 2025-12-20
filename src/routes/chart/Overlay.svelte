<script lang="ts">
    import { goto } from '$app/navigation';
    import { ChartOverlay } from './overlay.svelte.js';
    import * as AUTH from '$lib/constants/auth.js';

    let { overlay }: { overlay: ChartOverlay } = $props();
</script>

{#if overlay.account}
    <div style="
        position: fixed;
        left: 0;
        top: 1%;
        z-index: 50;
        display: flex;
        align-items: stretch;
    ">
        <!-- The Toggle Arrow (Always Fixed at Left) -->
        <button
                onclick={() => overlay.toggle()}
                style="
                background: rgba(40, 40, 40, 0.9);
                border: 1px solid #333;
                border-left: none; /* flush with screen edge */
                border-top-right-radius: {overlay.isOpen ? '0' : '8px'};
                border-bottom-right-radius: {overlay.isOpen ? '0' : '8px'};
                padding: 0 0.5rem;
                color: #d1d4dc;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 3.5rem; /* Enforce consistent height matching the content */
                /* Add the color indicator here so user knows context even when collapsed */
                border-left: 4px solid {overlay.mode === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
            "
        >
            {#if overlay.isOpen}
                <span style="font-size: 0.8rem;">◀</span>
            {:else}
                <span style="font-size: 0.8rem;">▶</span>
            {/if}
        </button>

        <!-- The Data Card (Split Navigation) -->
        {#if overlay.isOpen}
            <div
                    style="
                    background: rgba(20, 20, 20, 0.9);
                    backdrop-filter: blur(4px);
                    border: 1px solid #333;
                    border-left: none;
                    border-top-right-radius: 8px;
                    border-bottom-right-radius: 8px;
                    color: white;
                    text-align: left;
                    box-shadow: 4px 0 10px rgba(0,0,0,0.5);
                    display: flex;
                    align-items: stretch;
                    min-height: 3.5rem;
                "
            >
                <!-- Market Name -> /instrument -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => goto('/instrument')}
                        onkeydown={(e) => e.key === 'Enter' && goto('/instrument')}
                        style="
                        padding: 0.75rem 1rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        outline: none;
                    "
                >
                    <div style="font-size: 1rem; font-weight: bold; white-space: nowrap;">
                        {overlay.marketName}
                    </div>
                </div>

                <!-- Vertical Separator -->
                <div style="width: 1px; background: #444; margin: 0.5rem 0;"></div>

                <!-- Account Info -> /accounts -->
                <div
                        role="button"
                        tabindex="0"
                        onclick={() => goto('/accounts')}
                        onkeydown={(e) => e.key === 'Enter' && goto('/accounts')}
                        style="
                        padding: 0.75rem 1rem;
                        cursor: pointer;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        line-height: 1.2;
                        outline: none;
                    "
                >
                    <div style="font-size: 0.75rem; color: #ddd;">
                        {overlay.account.accountName} <span style="font-size: 0.65rem; color: #aaa;">({overlay.mode})</span>
                    </div>
                    <div style="font-size: 0.9rem; font-weight: bold;">
                        {overlay.account.symbol}{overlay.account.balance.balance.toFixed(2)}
                    </div>
                </div>
            </div>
        {/if}
    </div>
{/if}