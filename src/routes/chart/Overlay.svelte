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