<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import * as STORAGE from '$lib/constants/storage.js';

    let metrics = $state<any[]>([]);

    function scan() {
        if (typeof window === 'undefined') return;

        const vv = window.visualViewport;

        metrics = [
            {
                category: "Window Inner (CSS Pixels)",
                w: window.innerWidth,
                h: window.innerHeight
            },
            {
                category: "Window Outer",
                w: window.outerWidth,
                h: window.outerHeight
            },
            {
                category: "Screen (Physical Device)",
                w: screen.width,
                h: screen.height
            },
            {
                category: "Visual Viewport",
                w: vv?.width || 0,
                h: vv?.height || 0
            },
            {
                category: "LocalStorage Cache (Current)",
                w: localStorage.getItem(STORAGE.MAX_LONG_KEY),
                h: localStorage.getItem(STORAGE.MAX_SHORT_KEY)
            }
        ];
    }

    onMount(() => {
        scan();
        window.addEventListener('resize', scan);
        window.addEventListener('orientationchange', scan);
    });

    onDestroy(() => {
        if (typeof window === 'undefined') return;
        window.removeEventListener('resize', scan);
        window.removeEventListener('orientationchange', scan);
    });
</script>

<div style="font-family: monospace; padding: 1rem; background: #111; border-radius: 8px; margin-top: 2rem; border: 1px solid #333;">
    <h3 style="margin-bottom: 1rem; color: #888; font-size: 0.9rem;">Viewport Metrics</h3>
    <div style="display: grid; gap: 0.5rem;">
        {#each metrics as m}
            <div style="background: #222; padding: 0.5rem; border-radius: 4px; border: 1px solid #333; font-size: 0.8rem;">
                <div style="color: #666; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.25rem;">
                    {m.category}
                </div>
                {#if m.val !== undefined}
                    <div style="font-weight: bold;">{m.val}</div>
                {:else}
                    <div style="display: flex; gap: 1rem;">
                        <div>
                            <span style="color: #666;">W:</span>
                            <span style="font-weight: bold; color: {m.w > 1000 ? '#ef5350' : '#fff'}">{m.w}</span>
                        </div>
                        <div>
                            <span style="color: #666;">H:</span>
                            <span style="font-weight: bold;">{m.h}</span>
                        </div>
                    </div>
                {/if}
            </div>
        {/each}
    </div>

    <div style="margin-top: 1rem; border-top: 1px solid #333; padding-top: 1rem;">
        <button
                onclick={() => {
                localStorage.clear();
                scan();
                alert('Storage Cleared');
            }}
                style="
                background: #ef5350;
                color: white;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 4px;
                width: 100%;
                font-weight: bold;
                cursor: pointer;
                font-size: 0.8rem;
            "
        >
            NUKE LOCAL STORAGE
        </button>
    </div>
</div>