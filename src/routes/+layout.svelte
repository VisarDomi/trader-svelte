<script lang="ts">
    import '$lib/styles.css';
    import { viewportScanner } from '$lib/utils/dimension.js';
    import { startRestHeartbeat } from '$lib/services/auth.js';
    let { children } = $props();
    $effect(viewportScanner);
    $effect(startRestHeartbeat);
</script>

<svelte:head>
    <title>Moon Tendies</title>
</svelte:head>

{@render children()}