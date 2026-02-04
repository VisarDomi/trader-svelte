<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { instrumentStore } from '$lib/domains/market/stores/InstrumentStore.svelte.js';
    import InstrumentCard from '$lib/domains/market/components/InstrumentCard.svelte';

    onMount(() => {
        instrumentStore.load();
    });

    function handleSelect(epic: string) {
        instrumentStore.select(epic);
        goto('/chart');
    }
</script>

<div style="padding: 1rem; max-width: 900px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Select Instrument</h1>
        <a href="/chart" style="color: #d1d4dc;">← Back</a>
    </div>

    {#if instrumentStore.isLoading}
        <p>Fetching detailed market data...</p>
    {:else if instrumentStore.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px;">
            {instrumentStore.error}
        </div>
    {:else}
        <div style="display: grid; gap: 2rem;">
            {#each instrumentStore.instruments as m (m.instrument.epic)}
                <InstrumentCard
                        market={m}
                        preferences={instrumentStore.userPreferences}
                        onSelect={handleSelect}
                />
            {/each}
        </div>
    {/if}
</div>