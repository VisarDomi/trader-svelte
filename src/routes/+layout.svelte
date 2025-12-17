<script lang="ts">
    import '$lib/styles.css';
    import {viewportScanner} from '$lib/utils/dimension.js';

    let { children } = $props();

    $effect(() => viewportScanner());
    import { type IChartApi } from 'lightweight-charts';
</script>

<svelte:head>
    <title>Moon Tendies</title>
</svelte:head>

{@render children()}
