<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { viewport } from '$lib/services/viewport.svelte.js';

    let metrics = $state<Record<string, string | number>>({});
    let interval: ReturnType<typeof setInterval>;

    function update() {
        if (typeof window === 'undefined') return;

        const vv = window.visualViewport;
        const chartDims = viewport.getChartDimensions();

        metrics = {
            'Win Inner': `${window.innerWidth} x ${window.innerHeight}`,
            'Win Outer': `${window.outerWidth} x ${window.outerHeight}`,
            'Screen': `${screen.width} x ${screen.height}`,
            'VisualVP': vv ? `${vv.width.toFixed(0)} x ${vv.height.toFixed(0)}` : 'N/A',
            'Zoom (Scale)': vv ? vv.scale.toFixed(3) : 'N/A',
            'Pixel Ratio': window.devicePixelRatio.toFixed(3),
            'Service W': viewport.width,
            'Service H': viewport.height,
            'Cache Long': viewport.maxWidth,
            'Cache Short': viewport.maxHeight,
            'Chart CALC': `${chartDims.width} x ${chartDims.height}`
        };
    }

    function nuke() {
        viewport.resetCache();
        update();
    }

    onMount(() => {
        update();
        interval = setInterval(update, 100);
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update);
    });

    onDestroy(() => {
        clearInterval(interval);
        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update);
        }
    });
</script>

<div style="
    position: fixed;
    bottom: 0;
    right: 0; /* MOVED TO RIGHT */
    width: 240px;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid #FF00FF;
    border-top-left-radius: 8px; /* Changed radius corner */
    padding: 10px;
    z-index: 9999;
    font-family: monospace;
    font-size: 10px;
    color: #00FF00;
    pointer-events: auto;
">
    <div style="font-weight: bold; border-bottom: 1px solid #444; margin-bottom: 5px; color: #FF00FF;">
        PWA DEBUGGER
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
        {#each Object.entries(metrics) as [key, val]}
            <div style="color: #aaa;">{key}:</div>
            <div style="text-align: right; font-weight: bold; color: #fff;">{val}</div>
        {/each}
    </div>

    <button
            onclick={nuke}
            style="
            width: 100%;
            margin-top: 10px;
            background: #ef5350;
            color: white;
            border: none;
            padding: 5px;
            font-size: 10px;
            cursor: pointer;
            font-weight: bold;
        "
    >
        NUKE STORAGE & RESET
    </button>
</div>