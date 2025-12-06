<script lang="ts">
    import { onMount } from 'svelte';

    function scanDimensions() {
        const sources = [
            { name: 'window.inner', w: window.innerWidth, h: window.innerHeight },
            { name: 'window.outer', w: window.outerWidth, h: window.outerHeight },
            { name: 'screen', w: screen.width, h: screen.height },
            { name: 'screen.avail', w: screen.availWidth, h: screen.availHeight },
            { name: 'visualViewport', w: window.visualViewport?.width || 0, h: window.visualViewport?.height || 0 }
        ];
        let savedLong = parseFloat(localStorage.getItem('MAX_LONG') || '0');
        let savedShort = parseFloat(localStorage.getItem('MAX_SHORT') || '0');
        sources.forEach(s => {
            if (!s.w || !s.h) return;

            const long = Math.max(s.w, s.h);
            const short = Math.min(s.w, s.h);

            if (long > savedLong && long < 4000) savedLong = long;
            if (short > savedShort && short < 4000) savedShort = short;
        });
        localStorage.setItem('MAX_LONG', savedLong.toString());
        localStorage.setItem('MAX_SHORT', savedShort.toString());
    }

    onMount(() => {
        scanDimensions();
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
