<script lang="ts">
    import { onMount } from 'svelte';

    // State using Svelte 5 Runes
    let stats = $state({
        currentW: 0,
        currentH: 0,
        maxLong: 0,
        maxShort: 0
    });

    function scanDimensions() {
        // 1. Gather every source iOS gives us
        const sources = [
            { name: 'window.inner', w: window.innerWidth, h: window.innerHeight },
            { name: 'window.outer', w: window.outerWidth, h: window.outerHeight },
            { name: 'screen', w: screen.width, h: screen.height },
            { name: 'screen.avail', w: screen.availWidth, h: screen.availHeight },
            { name: 'visualViewport', w: window.visualViewport?.width || 0, h: window.visualViewport?.height || 0 }
        ];

        // 2. Load History
        let savedLong = parseFloat(localStorage.getItem('MAX_LONG') || '0');
        let savedShort = parseFloat(localStorage.getItem('MAX_SHORT') || '0');

        // 3. Find the biggest physical pixels
        sources.forEach(s => {
            if (!s.w || !s.h) return;

            const long = Math.max(s.w, s.h);
            const short = Math.min(s.w, s.h);

            // Filter outliers (desktop bugs) and update max
            if (long > savedLong && long < 4000) savedLong = long;
            if (short > savedShort && short < 4000) savedShort = short;
        });

        // 4. Save
        localStorage.setItem('MAX_LONG', savedLong.toString());
        localStorage.setItem('MAX_SHORT', savedShort.toString());

        // 5. Update UI
        stats = {
            currentW: window.innerWidth,
            currentH: window.innerHeight,
            maxLong: savedLong,
            maxShort: savedShort
        };
    }

    onMount(() => {
        scanDimensions();

        // Listen to everything that might change size
        window.addEventListener('resize', scanDimensions);
        window.addEventListener('orientationchange', scanDimensions);
        window.visualViewport?.addEventListener('resize', scanDimensions);

        return () => {
            window.removeEventListener('resize', scanDimensions);
            window.removeEventListener('orientationchange', scanDimensions);
            window.visualViewport?.removeEventListener('resize', scanDimensions);
        };
    });
</script>

<div class="debug-float">
    <div><strong>Current:</strong> {stats.currentW} x {stats.currentH}</div>
    <div style="margin-top: 4px; border-top: 1px solid #555; padding-top: 4px;">
        <strong>MAX Long:</strong> {stats.maxLong}<br>
        <strong>MAX Short:</strong> {stats.maxShort}
    </div>
</div>

<style>
    .debug-float {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.85);
        color: #00ff00;
        border: 1px solid #00ff00;
        padding: 10px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        z-index: 99999;
        pointer-events: none; /* Lets you click through it */
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
</style>