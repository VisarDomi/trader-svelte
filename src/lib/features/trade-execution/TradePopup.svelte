<script lang="ts">
    import * as TRADING from '$lib/shared/constants/trading.js';
    import type { PlannedTrade } from '$lib/features/trade-execution/TradePlanner.js';
    import { bus } from '$lib/core/events/globalBus.js';
    import * as EVENTS from '$lib/shared/constants/events.js';

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

    $effect(() => {
        if (!isOpen) return;
        bus.emit(EVENTS.OVERLAY_BLOCK_CROSSHAIR, undefined as never);
        return () => {
            bus.emit(EVENTS.OVERLAY_UNBLOCK_CROSSHAIR, undefined as never);
        };
    });
</script>

{#if isOpen && plannedTrade}
    <!-- Backdrop is click-through so chart taps can re-plan at a different price -->
    <div class="backdrop">
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
        pointer-events: none;
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
        pointer-events: auto;
    }
</style>
