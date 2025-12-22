<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { preferencesStore } from '$lib/stores/preferences.svelte.js';
    import AccountCard from '$lib/components/AccountCard.svelte';
    import * as AUTH from '$lib/constants/auth.js';
    import type { URL_TYPE } from '$lib/types/url.js';
    import type { LeverageCategory } from '$lib/types/account.js';

    onMount(() => {
        const type = page.url.searchParams.get('type') as URL_TYPE | null;
        const target = (type === AUTH.REAL_TYPE || type === AUTH.DEMO_TYPE)
            ? type
            : AUTH.REAL_TYPE;

        preferencesStore.init(target);
    });
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Preferences</h1>
        <div style="display: flex; gap: 1rem; align-items: center;">
            <a href="/viewport" style="color: #666; font-size: 0.8rem; text-decoration: none; border: 1px solid #333; padding: 4px 8px; border-radius: 4px;">Viewport Debug</a>
            <a href="/accounts" style="color: #d1d4dc;">← Back</a>
        </div>
    </div>

    {#if preferencesStore.account}
        <AccountCard
                account={preferencesStore.account}
                mode={preferencesStore.activeType}
                badgeText={`ID: ${preferencesStore.account.accountId}`}
        />
    {/if}

    {#if preferencesStore.isLoading}
        <p>Loading preferences...</p>
    {:else if preferencesStore.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
            {preferencesStore.error}
        </div>
    {:else if preferencesStore.data}
        <div style="background: #1a1a1a; padding: 1.5rem; border-radius: 8px; border: 1px solid #333;">

            <div style="margin-bottom: 2rem; opacity: 0.5;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: not-allowed;">
                    <input type="checkbox" checked={false} disabled />
                    <span style="font-weight: bold; color: #888;">Hedging Mode (Disabled)</span>
                </label>
                <p style="font-size: 0.8rem; color: #666; margin-top: 0.25rem;">
                    Hedging is strictly disabled to ensure single-position flow.
                </p>
            </div>

            <h3 style="margin-bottom: 1rem; border-bottom: 1px solid #333; padding-bottom: 0.5rem;">Leverages</h3>

            <div style="display: grid; gap: 1.5rem;">
                {#each Object.entries(preferencesStore.data.leverages) as [key, info]}
                    {@const category = key as LeverageCategory}
                    <div>
                        <div style="margin-bottom: 0.5rem; font-weight: bold;">{category}</div>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            {#each info.available as option}
                                <button
                                        onclick={() => preferencesStore.setLeverage(category, option)}
                                        style="
                                        padding: 0.5rem 1rem;
                                        border: 1px solid {preferencesStore.leverages[category] === option ? 'white' : '#444'};
                                        background: {preferencesStore.leverages[category] === option ? '#444' : 'transparent'};
                                        color: white;
                                        cursor: pointer;
                                        border-radius: 4px;
                                    ">
                                    1:{option}
                                </button>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>

            <div style="margin-top: 2rem; border-top: 1px solid #333; padding-top: 1.5rem; text-align: right;">
                <button
                        onclick={() => preferencesStore.save()}
                        disabled={preferencesStore.isSaving}
                        style="
                        padding: 0.75rem 2rem;
                        background-color: {preferencesStore.activeType === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
                        color: white;
                        border: none;
                        border-radius: 4px;
                        font-weight: bold;
                        cursor: pointer;
                        opacity: {preferencesStore.isSaving ? 0.7 : 1};
                    "
                >
                    {preferencesStore.isSaving ? 'Saving...' : 'Save Preferences'}
                </button>
            </div>

        </div>
    {/if}
</div>