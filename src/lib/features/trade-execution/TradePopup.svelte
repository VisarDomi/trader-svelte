<script lang="ts">
    import * as TRADING from '$lib/shared/constants/trading.js';
    import type { PlannedTrade } from '$lib/features/trade-execution/TradePlanner.js';
    import { CHART_CONTAINER_ID } from '$lib/shared/constants/chart.js';

    let {
        isOpen,
        plannedTrade,
        isExecuting,
        onConfirm,
        onCancel
    } = $props<{
        isOpen: boolean;
        plannedTrade: PlannedTrade | null;
        isExecuting: boolean;
        onConfirm: () => void;
        onCancel: () => void;
    }>();

    // Disable pointer events on the chart while popup is open.
    // On close, block synthetic hover/enter/move events for 300ms.
    //
    // Why: iOS fires synthetic mouseover/pointerenter/pointermove events
    // at the last known touch position when pointer-events are restored
    // on an element. Without this, LWC's crosshair activates the instant
    // the popup closes, even though the user isn't touching the chart.
    $effect(() => {
        if (!isOpen) return;
        const chart = document.getElementById(CHART_CONTAINER_ID);
        if (chart) chart.style.pointerEvents = 'none';
        return () => {
            const c = document.getElementById(CHART_CONTAINER_ID);
            if (!c) return;

            let blocking = true;
            const blocked = ['mouseover', 'mouseenter', 'mousemove',
                'pointerenter', 'pointerover', 'pointermove'];

            function blockAll(e: Event) {
                if (!blocking) return;
                e.stopImmediatePropagation();
                e.stopPropagation();
                e.preventDefault();
            }

            for (const evt of blocked) c.addEventListener(evt, blockAll, true);
            c.style.pointerEvents = '';

            setTimeout(() => {
                blocking = false;
                for (const evt of blocked) c!.removeEventListener(evt, blockAll, true);
            }, 300);
        };
    });
</script>

{#if isOpen && plannedTrade}
    <!-- Full-screen backdrop to capture all touch/pointer events -->
    <div
            class="backdrop"
            ontouchstart={(e) => e.preventDefault()}
    >
        <div
                role="dialog"
                tabindex="-1"
                class="popup"
        >
        <div style="display: flex; gap: 1rem; justify-content: center;">
            {#if isExecuting}
                <div style="
                    padding: 0.75rem 1.5rem;
                    color: white;
                    font-weight: bold;
                    font-size: 0.9rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                ">
                    <span>WAITING FOR CONFIRMATION...</span>
                </div>
            {:else}
                <button
                        onclick={onCancel}
                        style="
                        padding: 0.75rem 1.5rem;
                        background: transparent;
                        border: 1px solid #666;
                        color: #ccc;
                        border-radius: 4px;
                        cursor: pointer;
                    "
                >
                    Cancel
                </button>
                <button
                        onclick={onConfirm}
                        style="
                        padding: 0.75rem 1.5rem;
                        background: {plannedTrade.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'};
                        border: none;
                        color: white;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                    "
                >
                    OPEN
                </button>
            {/if}
        </div>
        </div>
    </div>
{/if}

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
    }

    .popup {
        position: absolute;
        top: calc(env(safe-area-inset-top, 0px) + 3rem);
        left: 50%;
        transform: translateX(-50%);
        background: rgba(20, 20, 20, 0.95);
        border: 1px solid #444;
        padding: 1rem;
        border-radius: 8px;
        text-align: center;
        min-width: 250px;
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
</style>
