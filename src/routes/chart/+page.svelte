<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { ChartLogic } from '$lib/modules/chart/core/ChartLogic.svelte.js';
    import TopBar from '$lib/modules/chart/components/TopBar.svelte';
    import ChartOverlay from '$lib/modules/chart/components/ChartOverlay.svelte';
    import TradePopup from '$lib/modules/trading/components/TradePopup.svelte';
    import * as CHART_CONST from '$lib/shared/constants/chart.js';

    import { tradeManager } from '$lib/modules/trading/stores/TradeStore.svelte.js';
    import { marketStore } from '$lib/modules/market/stores/MarketStore.svelte.js';
    import { accountStore } from '$lib/modules/trading/stores/AccountStore.svelte.js';
    import { positionStore } from '$lib/modules/trading/stores/PositionStore.svelte.js';
    import { session } from '$lib/modules/core/services/SessionManager.js';

    let chartContainer: HTMLDivElement;

    const logic = new ChartLogic(
        marketStore,
        accountStore,
        positionStore,
        tradeManager,
        session
    );

    onMount(() => {
        logic.init(chartContainer);
    });

    onDestroy(() => {
        logic.destroy();
    });
</script>

<TopBar layout={logic.layout} />
<ChartOverlay overlay={logic.overlay} />

<TradePopup
        isOpen={tradeManager.isPlanning}
        plannedTrade={tradeManager.plannedTrade}
        isExecuting={tradeManager.isExecuting}
        onConfirm={() => logic.confirmTrade()}
        onCancel={() => logic.cancelPlanning()}
/>

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>