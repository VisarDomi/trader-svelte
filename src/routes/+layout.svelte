<script lang="ts">
    import '$lib/styles.css';
    import { viewport } from '$lib/services/viewport.svelte.js';
    import { startRestHeartbeat } from '$lib/services/auth.js';
    import ToastContainer from '$lib/components/ToastContainer.svelte';
    import { onMount, onDestroy } from 'svelte';

    let { children } = $props();

    onMount(() => {
        viewport.init();
    });

    onDestroy(() => {
        viewport.destroy();
    });

    $effect(startRestHeartbeat);
</script>

<svelte:head>
    <title>Moon Tendies</title>
</svelte:head>

{@render children()}

<ToastContainer />