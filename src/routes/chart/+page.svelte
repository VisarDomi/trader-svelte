<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { ChartLogic } from './logic.svelte.js';
    import TopBar from './TopBar.svelte';
    import Overlay from './Overlay.svelte';
    import TradePopup from './TradePopup.svelte';
    import PwaDebug from '$lib/components/PwaDebug.svelte';
    import * as CHART_CONST from '$lib/constants/chart.js';

    // Global Stores (Dependency Injection Source)
    import { tradeManager } from '$lib/stores/trade.svelte.js';
    import { marketStore } from '$lib/stores/market.svelte.js';
    import { accountStore } from '$lib/stores/account.svelte.js';
    import { positionStore } from '$lib/stores/position.svelte.js';
    import { session } from '$lib/services/session.js';

    let chartContainer: HTMLDivElement;

    // Inject dependencies into the Controller
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
<Overlay overlay={logic.overlay} />
<PwaDebug />

<TradePopup
        isOpen={tradeManager.isPlanning}
        plannedTrade={tradeManager.plannedTrade}
        isExecuting={tradeManager.isExecuting}
        onConfirm={() => logic.confirmTrade()}
        onCancel={() => logic.cancelPlanning()}
/>

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>