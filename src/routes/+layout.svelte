<script lang="ts">
    import '$lib/styles.css';
    import { viewport } from '$lib/modules/core/services/ViewportService.svelte.js';
    import { startRestHeartbeat } from '$lib/modules/auth/services/AuthService.js';
    import ToastContainer from '$lib/ui/ToastContainer.svelte';
    import { onMount, onDestroy } from 'svelte';

    let { children } = $props();

    function preventZoom(e: Event) {
        // Critical: iOS ignores user-scalable=no in the meta tag.
        // We must prevent the default browser behavior for gestures to truly disable zooming.
        e.preventDefault();
    }

    onMount(() => {
        viewport.init();

        // Add global listeners to disable pinch-to-zoom everywhere
        // "passive: false" is strictly required for this to work in some browser versions
        document.addEventListener('gesturestart', preventZoom, { passive: false });
        document.addEventListener('gesturechange', preventZoom, { passive: false });
        document.addEventListener('gestureend', preventZoom, { passive: false });
    });

    onDestroy(() => {
        viewport.destroy();
        if (typeof document !== 'undefined') {
            document.removeEventListener('gesturestart', preventZoom);
            document.removeEventListener('gesturechange', preventZoom);
            document.removeEventListener('gestureend', preventZoom);
        }
    });

    $effect(startRestHeartbeat);
</script>

<svelte:head>
    <title>Moon Tendies</title>
</svelte:head>

{@render children()}

<ToastContainer />