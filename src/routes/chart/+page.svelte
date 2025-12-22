<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { ChartLogic } from './logic.svelte.js';
    import TopBar from './TopBar.svelte';
    import Overlay from './Overlay.svelte';
    import PwaDebug from '$lib/components/PwaDebug.svelte';
    import * as CHART_CONST from '$lib/constants/chart.js';
    import * as TRADING from '$lib/constants/trading.js';

    let chartContainer: HTMLDivElement;
    const logic = new ChartLogic();

    onMount(() => {
        logic.init(chartContainer);
    });

    onDestroy(() => {
        logic.destroy();
    });
</script>

<TopBar layout={logic.layout} />
<Overlay overlay={logic.overlay} />
<PwaDebug />

<!-- Planning Mode Confirmation Popup -->
{#if logic.isPlanning && logic.plannedTrade}
    <div style="
        position: fixed;
        top: 8rem; /* Adjusted position */
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
            <div style="font-weight: bold; color: {logic.plannedTrade.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'}">
                {logic.plannedTrade.direction}
            </div>
            <div style="color: #fff; margin-top: 0.25rem;">Size: {logic.plannedTrade.size}</div>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: center;">
            <button
                    onclick={() => logic.cancelPlanning()}
                    disabled={logic.isExecuting}
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
                    onclick={() => logic.confirmTrade()}
                    disabled={logic.isExecuting}
                    style="
                    padding: 0.75rem 1.5rem;
                    background: {logic.plannedTrade.direction === TRADING.BUY_DIRECTION ? '#26a69a' : '#ef5350'};
                    border: none;
                    color: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                "
            >
                {logic.isExecuting ? '...' : 'OPEN'}
            </button>
        </div>
    </div>
{/if}

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>