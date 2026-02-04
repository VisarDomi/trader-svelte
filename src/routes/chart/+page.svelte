<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { ChartLogic } from '$lib/modules/chart/core/ChartLogic.svelte.js';
    import TopBar from '$lib/modules/chart/components/TopBar.svelte';
    import Overlay from '$lib/modules/chart/components/ChartOverlay.svelte';
    import TradePopup from '$lib/modules/trading/components/TradePopup.svelte';
    import * as CHART_CONST from '$lib/shared/constants/chart.js';

    // Singletons for template binding
    import { tradeManager } from '$lib/modules/trading/stores/TradeStore.svelte.js';

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
<Overlay overlay={logic.overlay} />

<TradePopup
        isOpen={tradeManager.isPlanning}
        plannedTrade={tradeManager.plannedTrade}
        isExecuting={tradeManager.isExecuting}
        onConfirm={() => logic.confirmTrade()}
        onCancel={() => logic.cancelPlanning()}
/>

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>