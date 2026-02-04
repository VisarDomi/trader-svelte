<script lang="ts">
    import * as TRADING from '$lib/shared/constants/trading.js';
    import type { PlannedTrade } from '$lib/features/trade-execution/TradePlanner.js';
    import { shield } from '$lib/components/chart-engine/shield.js';

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
</script>

{#if isOpen && plannedTrade}
    <div style="
        position: fixed;
        top: 5rem;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(20, 20, 20, 0.95);
        border: 1px solid #444;
        padding: 1rem;
        border-radius: 8px;
        z-index: 100;
        text-align: center;
        min-width: 250px;
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    ">
        <div style="display: flex; gap: 1rem; justify-content: center;">
            <button
                    onclick={onCancel}
                    use:shield
                    disabled={isExecuting}
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
                    use:shield
                    disabled={isExecuting}
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
                {isExecuting ? '...' : 'OPEN'}
            </button>
        </div>
    </div>
{/if}