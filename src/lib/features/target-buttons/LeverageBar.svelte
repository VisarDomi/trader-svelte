<script lang="ts">
    import type { MarketDetailsResponse } from '$lib/shared/types/market.js';
    import type { AccountPreferences, LeverageCategory } from '$lib/shared/types/account.js';
    import { LeverageService } from '$lib/domains/trading/domain/LeverageService.js';
    import { preferencesStore } from '$lib/domains/trading/stores/PreferencesStore.svelte.js';

    let { market }: { market: MarketDetailsResponse } = $props();

    let currentLeverage = $derived(
        LeverageService.getEffectiveLeverage(market, preferencesStore.data)
    );

    let availableLeverages = $derived<number[]>(() => {
        const prefs = preferencesStore.data;
        if (!prefs) return [];
        const category = market.instrument.type as LeverageCategory;
        const setting = prefs.leverages[category];
        if (!setting) return [];
        return setting.available;
    });

    let saving = $state(false);

    async function handleSelect(value: number) {
        if (saving || value === currentLeverage) return;
        saving = true;

        const category = market.instrument.type as LeverageCategory;
        preferencesStore.setLeverage(category, value);
        await preferencesStore.save();

        saving = false;
    }
</script>

<div class="lever-bar">
    <span class="label">Lev</span>
    {#each availableLeverages as lev}
        <button
            class="lev-btn"
            class:active={lev === currentLeverage}
            class:saving={saving}
            onclick={() => handleSelect(lev)}
            disabled={saving}
        >
            {lev}
        </button>
    {/each}
</div>

<style>
    .lever-bar {
        display: flex;
        gap: 3px;
        padding: 4px 8px;
        align-items: center;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }

    .label {
        color: #888;
        font-size: 0.7rem;
        font-weight: bold;
        margin-right: 4px;
        flex-shrink: 0;
    }

    .lev-btn {
        padding: 4px 10px;
        border: 1px solid #444;
        background: transparent;
        color: #aaa;
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.75rem;
        font-weight: bold;
        flex-shrink: 0;
        transition: all 0.15s;
    }

    .lev-btn:hover {
        border-color: #666;
        color: white;
    }

    .lev-btn.active {
        background: #333;
        border-color: white;
        color: white;
    }

    .lev-btn.saving {
        opacity: 0.5;
    }
</style>
