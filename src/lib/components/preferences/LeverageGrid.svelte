<script lang="ts">
    import type { LeverageCategory } from '$lib/types/account.js';
    import type { AccountPreferences } from '$lib/types/account.js';

    let {
        preferences,
        stagedLeverages,
        onSelect
    } = $props<{
        preferences: AccountPreferences,
        stagedLeverages: Partial<Record<LeverageCategory, number>>,
        onSelect: (category: LeverageCategory, value: number) => void
    }>();
</script>

<div class="container">
    <h3 class="title">Leverages</h3>

    <div class="grid">
        {#each Object.entries(preferences.leverages) as [key, info]}
            {@const category = key}
            {@const currentSelected = stagedLeverages[category]}

            <div class="category-block">
                <div class="category-name">{category}</div>
                <div class="options-row">
                    {#each info.available as option}
                        <button
                                class="opt-btn"
                                class:selected={currentSelected === option}
                                onclick={() => onSelect(category, option)}
                        >
                            1:{option}
                        </button>
                    {/each}
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    .container { margin-bottom: 2rem; }
    .title {
        margin-bottom: 1rem;
        border-bottom: 1px solid #333;
        padding-bottom: 0.5rem;
        color: #d1d4dc;
    }
    .grid { display: grid; gap: 1.5rem; }

    .category-name {
        margin-bottom: 0.5rem;
        font-weight: bold;
        color: #fff;
        font-size: 0.9rem;
    }
    .options-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }

    .opt-btn {
        padding: 0.5rem 1rem;
        border: 1px solid #444;
        background: transparent;
        color: white;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s;
    }
    .opt-btn:hover { border-color: #666; }

    .opt-btn.selected {
        background: #444;
        border-color: white;
        font-weight: bold;
    }
</style>