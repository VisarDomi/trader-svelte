<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { ChartLogic } from './logic.svelte.js';
    import TopBar from './TopBar.svelte';
    import Overlay from './Overlay.svelte';
    import TradePopup from './TradePopup.svelte';
    import PwaDebug from '$lib/components/PwaDebug.svelte';
    import * as CHART_CONST from '$lib/constants/chart.js';

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

<TradePopup
        onConfirm={() => logic.confirmTrade()}
        onCancel={() => logic.cancelPlanning()}
/>

<div bind:this={chartContainer} id={CHART_CONST.CHART_CONTAINER_ID}></div>