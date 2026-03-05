<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { api } from '$lib/core/services/ApiService.svelte.js';
    import { searchMarkets } from '$lib/domains/market/services/MarketApiService.js';
    import { instrumentStore } from '$lib/domains/market/stores/InstrumentStore.svelte.js';
    import type { MarketSummary } from '$lib/shared/types/market.js';
    import { notifications } from '$lib/core/services/NotificationService.svelte.js';

    let query = $state('');
    let results = $state<MarketSummary[]>([]);
    let isLoading = $state(false);

    onMount(async () => {
        query = page.url.searchParams.get('q') || '';
        if (query) {
            await performSearch(query);
        }
    });

    async function performSearch(term: string) {
        isLoading = true;
        const client = api.client;
        if (!client) return;

        try {
            const data = await searchMarkets(client, term);
            results = data.markets ?? [];
        } catch (e) {
            console.error(e);
            notifications.error('Search failed');
        } finally {
            isLoading = false;
        }
    }

    function toggle(market: MarketSummary) {
        if (instrumentStore.isFavorite(market.epic)) {
            instrumentStore.removeFavorite(market.epic);
        } else {
            instrumentStore.addFavorite(market.epic);
        }
    }

    function isFav(epic: string) {
        return instrumentStore.isFavorite(epic);
    }
</script>

<div style="padding: 1rem; max-width: 900px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Results for "{query}"</h1>
        <a href="/instrument" style="color: #d1d4dc;">Done</a>
    </div>

    {#if isLoading}
        <p>Searching...</p>
    {:else if results.length === 0}
        <p>No markets found.</p>
    {:else}
        <div style="display: grid; gap: 1rem;">
            {#each results as m (m.epic)}
                <div class="result-row">
                    <div class="info">
                        <div class="symbol">{m.symbol}</div>
                        <div class="desc">{m.instrumentName} • {m.instrumentType}</div>
                    </div>

                    <button
                            class="toggle-btn"
                            class:added={isFav(m.epic)}
                            onclick={() => toggle(m)}
                    >
                        {isFav(m.epic) ? '−' : '+'}
                    </button>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .result-row {
        background: #1a1a1a;
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid #333;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .symbol { font-weight: bold; font-size: 1.1rem; color: white; }
    .desc { color: #888; font-size: 0.9rem; margin-top: 0.2rem; }

    .toggle-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: #26a69a;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding-bottom: 4px;
    }

    .toggle-btn.added {
        background: #ef5350;
    }
</style>