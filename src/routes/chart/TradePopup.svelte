<script lang="ts">
    import * as TRADING from '$lib/constants/trading.js';
    import type {Direction, TradeConfirmation} from '$lib/types/trading.js';

    // Pure component: Data passed in via props, no store imports
    let {
        isOpen,
        plannedTrade,
        isExecuting,
        onConfirm,
        onCancel
    } = $props<{
        isOpen: boolean;
        plannedTrade: (TradeConfirmation & { direction: Direction, entryPrice: number }) | null;
        isExecuting: boolean;
        onConfirm: () => void;
        onCancel: () => void;
    }>();
</script>

{#if isOpen && plannedTrade}
    <div style="
        position: fixed;
        top: 8rem;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(20, 20, 20, 0.95);
        border: 1px solid #444;
        padding: 1.5rem;
        border-radius: 8px;
        z-index: 100;
        text-align: center;
        min-width: 250px;
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    ">
        <h3 style="margin-bottom: 1rem; color: #d1d4dc;">Open Position?</h3>

        <div style="margin-bottom: 1.5rem; font-size: 1.1rem;">
            <div style="font-weight: bold; color: {plannedTrade.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}">
                {plannedTrade.direction}
            </div>
            <div style="color: #fff; margin-top: 0.25rem;">Size: {plannedTrade.size}</div>
            <div style="color: #888; font-size: 0.8rem; margin-top: 0.5rem;">
                TP: {plannedTrade.profitLevel} | SL: {plannedTrade.stopLevel}
            </div>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: center;">
            <button
                    onclick={onCancel}
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