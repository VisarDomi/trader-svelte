<script lang="ts">
    import { ChartUI } from '$lib/components/chart-engine/ChartResizer.svelte.js';
    import * as CHART_CONST from '$lib/shared/constants/chart.js';

    let { layout }: { layout: ChartUI } = $props();
</script>

<!-- Render Spacer for all iOS devices (PWA or Non-PWA) -->
{#if layout.isDataLoaded && layout.isIosDevice}
    <div
            id={CHART_CONST.TOPBAR_ID}
            style="height: {CHART_CONST.TOPBAR_HEIGHT}px; background-color: {CHART_CONST.BACKGROUND_COLOR};"
    >
    </div>
{/if}