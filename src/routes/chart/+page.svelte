<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { ChartLogic } from '$lib/features/chart-orchestration/ChartLogic.svelte.js';
    import TopBar from '$lib/components/chart-engine/TopBar.svelte';
    import ChartHud from '$lib/features/chart-hud/ChartHud.svelte';
    import TradePopup from '$lib/features/trade-execution/TradePopup.svelte';
    import * as CHART_CONST from '$lib/shared/constants/chart.js';

    // Singletons for template binding
    import { tradeManager } from '$lib/domains/trading/stores/TradeStore.svelte.js';

    // We instantiate logic without args now
    const logic = new ChartLogic();

    let chartContainer: HTMLDivElement;

    onMount(() => {
        logic.init(chartContainer);
    });

    onDestroy(() => {
        logic.destroy();
    });
</script>

<TopBar layout={logic.layout} />
<ChartHud overlay={logic.overlay} />

<TradePopup
        isOpen={tradeManager.isPlanning}
        plannedTrade={tradeManager.plannedTrade}
        isExecuting={tradeManager.isExecuting}
        onConfirm={() => logic.confirmTrade()}
        onCancel={() => logic.cancelPlanning()}
/>

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>