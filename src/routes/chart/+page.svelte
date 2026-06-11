<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { ChartLogic } from '$lib/features/chart-orchestration/ChartLogic.svelte.js';
    import ChartHud from '$lib/features/chart-hud/ChartHud.svelte';
    import TradePopup from '$lib/features/trade-execution/TradePopup.svelte';
    import TargetButtons from '$lib/features/target-buttons/TargetButtons.svelte';
    import LeverageBar from '$lib/features/target-buttons/LeverageBar.svelte';
    import * as CHART_CONST from '$lib/shared/constants/chart.js';

    import { session } from '$lib/core/services/SessionManager.js';
    import { preferencesStore } from '$lib/domains/trading/stores/PreferencesStore.svelte.js';
    import { tradeManager } from '$lib/domains/trading/stores/TradeStore.svelte.js';

    const logic = new ChartLogic();

    let chartContainer: HTMLDivElement;

    onMount(() => {
        logic.init(chartContainer);
        preferencesStore.init(session.mode);
    });

    onDestroy(() => {
        logic.destroy();
    });
</script>

<ChartHud overlay={logic.overlay} />

{#if logic.marketDetails}
    <TargetButtons market={logic.marketDetails} />
    <LeverageBar market={logic.marketDetails} />
{/if}

<TradePopup
        isOpen={tradeManager.isPlanning}
        plannedTrade={tradeManager.plannedTrade}
        isExecuting={tradeManager.isExecuting}
        onConfirm={() => logic.confirmTrade()}
        onCancel={() => logic.cancelPlanning()}
/>

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>
