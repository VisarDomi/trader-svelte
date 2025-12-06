<script lang="ts">
    import '$lib/styles.css';
    import {initViewportScanner} from '$lib/dimensions/scanner.js';

    let { children } = $props();

    $effect(() => initViewportScanner());
</script>

<svelte:head>
    <title>Moon Tendies</title>
</svelte:head>

{@render children()}
