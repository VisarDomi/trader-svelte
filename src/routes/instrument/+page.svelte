<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { instrumentStore } from '$lib/domains/market/stores/InstrumentStore.svelte.js';
    import InstrumentCard from '$lib/domains/market/components/InstrumentCard.svelte';

    let searchTerm = $state('');

    onMount(() => {
        instrumentStore.load();
    });

    function handleSelect(epic: string) {
        instrumentStore.select(epic);
        goto('/chart');
    }

    function handleRemove(epic: string) {
        instrumentStore.removeFavorite(epic);
    }

    function handleSearchKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && searchTerm.trim().length > 0) {
            goto(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
        }
    }
</script>

<div style="padding: 1rem; max-width: 900px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Instruments</h1>
        <a href="/chart" style="color: #d1d4dc;">← Back</a>
    </div>

    <!-- Search Input -->
    <div style="margin-bottom: 2rem;">
        <input
                type="text"
                bind:value={searchTerm}
                onkeydown={handleSearchKeydown}
                placeholder="Search markets (e.g. Gold, Apple)..."
                style="
                width: 100%;
                padding: 12px;
                font-size: 16px;
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 8px;
                color: white;
            "
        />
    </div>

    {#if instrumentStore.isLoading}
        <p>Fetching market data...</p>
    {:else if instrumentStore.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px;">
            {instrumentStore.error}
        </div>
    {:else if instrumentStore.instruments.length === 0}
        <div style="text-align: center; color: #888; padding: 2rem; border: 1px dashed #333; border-radius: 8px;">
            No instruments selected. Use the search bar above to add markets.
        </div>
    {:else}
        <div style="display: grid; gap: 2rem;">
            {#each instrumentStore.instruments as m (m.instrument.epic)}
                <InstrumentCard
                        market={m}
                        preferences={instrumentStore.userPreferences}
                        onSelect={handleSelect}
                        onRemove={handleRemove}
                />
            {/each}
        </div>
    {/if}
</div>