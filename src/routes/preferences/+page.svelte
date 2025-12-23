<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { preferencesStore } from '$lib/stores/preferences.svelte.js';
    import * as AUTH from '$lib/constants/auth.js';
    import type { URL_TYPE } from '$lib/types/url.js';

    import AccountCard from '$lib/components/AccountCard.svelte';
    import LeverageGrid from '$lib/components/preferences/LeverageGrid.svelte';

    onMount(() => {
        const type = page.url.searchParams.get('type') as URL_TYPE | null;
        const target = (type === AUTH.REAL_TYPE || type === AUTH.DEMO_TYPE)
            ? type
            : AUTH.REAL_TYPE;

        preferencesStore.init(target);
    });
</script>

<div class="page-container">
    <div class="header">
        <h1>Preferences</h1>
        <div class="controls">
            <a href="/accounts" class="back-link">← Back</a>
        </div>
    </div>

    {#if preferencesStore.account}
        <AccountCard
                account={preferencesStore.account}
                mode={preferencesStore.activeType}
                badgeText={`ID: ${preferencesStore.account.accountId}`}
        />
    {/if}

    {#if preferencesStore.isLoading && !preferencesStore.data}
        <p>Loading preferences...</p>
    {:else}
        {#if preferencesStore.error}
            <div class="error-box">
                {preferencesStore.error}
            </div>
        {/if}

        {#if preferencesStore.data}
            <div class="content-box" style="opacity: {preferencesStore.isLoading ? 0.5 : 1}; transition: opacity 0.2s;">

                <div class="hedging-section">
                    <label class="hedging-label">
                        <input type="checkbox" checked={false} disabled />
                        <span>Hedging Mode (Disabled)</span>
                    </label>
                    <p class="hedging-desc">
                        Hedging is strictly disabled to ensure single-position flow.
                    </p>
                </div>

                <LeverageGrid
                        preferences={preferencesStore.data}
                        stagedLeverages={preferencesStore.leverages}
                        onSelect={(cat, val) => preferencesStore.setLeverage(cat, val)}
                />

                <div class="actions">
                    {#if preferencesStore.activeType === AUTH.DEMO_TYPE}
                        <button
                                onclick={() => preferencesStore.resetDemoBalance()}
                                disabled={preferencesStore.isSaving}
                                class="reset-btn"
                        >
                            Reset to $1000
                        </button>
                    {/if}

                    <button
                            onclick={() => preferencesStore.save()}
                            disabled={preferencesStore.isSaving}
                            class="save-btn"
                            style="background-color: {preferencesStore.activeType === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'}"
                    >
                        {preferencesStore.isSaving ? 'Saving...' : 'Save Preferences'}
                    </button>
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .page-container { padding: 1rem; max-width: 800px; margin: 0 auto; }

    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    .controls { display: flex; gap: 1rem; align-items: center; }
    .back-link { color: #d1d4dc; }

    .error-box { color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
    .content-box { background: #1a1a1a; padding: 1.5rem; border-radius: 8px; border: 1px solid #333; }

    .hedging-section { margin-bottom: 2rem; opacity: 0.5; }
    .hedging-label { display: flex; align-items: center; gap: 0.5rem; cursor: not-allowed; font-weight: bold; color: #888; }
    .hedging-desc { font-size: 0.8rem; color: #666; margin-top: 0.25rem; }

    .actions {
        margin-top: 2rem;
        border-top: 1px solid #333;
        padding-top: 1.5rem;
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
    }

    .save-btn {
        padding: 0.75rem 2rem; color: white; border: none; border-radius: 4px;
        font-weight: bold; cursor: pointer;
    }
    .save-btn:disabled { opacity: 0.7; }

    .reset-btn {
        padding: 0.75rem 1.5rem;
        background: transparent;
        border: 1px solid #444;
        color: #aaa;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .reset-btn:hover { border-color: #ef5350; color: #ef5350; }
    .reset-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>