<script lang="ts">
    import '$lib/styles.css';
    import { onMount, onDestroy } from 'svelte';
    import { appEngine } from '$lib/modules/core/AppEngine.svelte.js';
    import ToastContainer from '$lib/ui/ToastContainer.svelte';

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

<!-- We could add a global loading spinner here if appEngine.status === 'BOOTING' -->

{@render children()}

<ToastContainer />