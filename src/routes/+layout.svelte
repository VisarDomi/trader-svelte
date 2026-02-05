<script lang="ts">
    import '$lib/styles.css';
    import { onMount, onDestroy } from 'svelte';
    import { appEngine } from '$lib/core/engine/AppEngine.svelte.js'; // Updated import path
    import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
    import HydrationGate from '$lib/components/ui/HydrationGate.svelte';

    let { children } = $props();

    function preventZoom(e: Event) {
        e.preventDefault();
    }

    onMount(() => {
        appEngine.boot();

        document.addEventListener('gesturestart', preventZoom, { passive: false });
        document.addEventListener('gesturechange', preventZoom, { passive: false });
        document.addEventListener('gestureend', preventZoom, { passive: false });
    });

    onDestroy(() => {
        if (typeof document !== 'undefined') {
            document.removeEventListener('gesturestart', preventZoom);
            document.removeEventListener('gesturechange', preventZoom);
            document.removeEventListener('gestureend', preventZoom);
        }
    });
</script>

<svelte:head>
    <title>Moon Tendies</title>
</svelte:head>

<HydrationGate>
    {@render children()}
</HydrationGate>

<ToastContainer />