<script lang="ts">
    import { browser } from '$app/environment';
    import '$lib/styles.css';
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import { appEngine } from '$lib/core/engine/AppEngine.svelte.js';
    import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
    import HydrationGate from '$lib/components/ui/HydrationGate.svelte';
    import { setRuntimeAppProfile } from '$lib/core/config/runtime.js';

    let { children, data } = $props();

    const fullscreen = $derived($page.route?.id === '/chart');

    function preventZoom(e: Event) {
        e.preventDefault();
    }

    onMount(() => {
        setRuntimeAppProfile(data.appProfile);

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }

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
    <div class:safe-area={!fullscreen}>
        {@render children()}
    </div>
</HydrationGate>

<ToastContainer />

<style>
    .safe-area {
        padding-top: env(safe-area-inset-top, 0px);
    }
</style>
