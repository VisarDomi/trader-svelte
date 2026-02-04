<script lang="ts">
    import { notifications } from '$lib/modules/core/services/NotificationService.svelte.js';
    import { flip } from 'svelte/animate';
    import { fade, fly } from 'svelte/transition';
</script>

<div style="
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 9999;
    width: 90%;
    max-width: 400px;
    pointer-events: none;
">
    {#each notifications.items as note (note.id)}
        <div
                animate:flip={{ duration: 300 }}
                in:fly={{ y: 20, duration: 300 }}
                out:fade={{ duration: 200 }}
                style="
                pointer-events: auto;
                background: #1a1a1a;
                color: white;
                padding: 1rem;
                border-radius: 8px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-left: 4px solid {
                    note.type === 'success' ? '#26a69a' :
                    note.type === 'error' ? '#ef5350' :
                    '#d1d4dc'
                };
            "
        >
            <span style="font-size: 0.9rem; font-weight: 500;">{note.message}</span>
            <button
                    onclick={() => notifications.remove(note.id)}
                    style="
                    background: transparent;
                    border: none;
                    color: #888;
                    cursor: pointer;
                    margin-left: 1rem;
                    font-size: 1.2rem;
                "
            >
                ×
            </button>
        </div>
    {/each}
</div>