<script lang="ts">
    import { onMount } from 'svelte';
    import { PreferencesLogic } from './logic.svelte.js';
    import * as AUTH from '$lib/constants/auth.js';
    const logic = new PreferencesLogic();
    onMount(() => {
        logic.init();
    });
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Preferences</h1>
        <a href="/accounts" style="color: #d1d4dc;">← Back</a>
    </div>

    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
        <button
                onclick={() => logic.switchType(AUTH.REAL_TYPE)}
                style="padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; background: {logic.activeType === AUTH.REAL_TYPE ? '#26a69a' : '#333'}; color: white;">
            REAL
        </button>
        <button
                onclick={() => logic.switchType(AUTH.DEMO_TYPE)}
                style="padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; background: {logic.activeType === AUTH.DEMO_TYPE ? '#ef5350' : '#333'}; color: white;">
            DEMO
        </button>
    </div>

    <!-- Active Account Banner -->
    {#if logic.currentAccount}
        <div style="
            margin-bottom: 2rem;
            padding: 1rem;
            background: #262626;
            border-radius: 4px;
            border-left: 4px solid {logic.activeType === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <div>
                <div style="font-weight: bold; font-size: 1.1rem; color: #fff;">
                    {logic.currentAccount.accountName} ({logic.currentAccount.currency})
                </div>
                <div style="font-size: 0.85rem; color: #aaa; margin-top: 0.25rem;">
                    ID: {logic.currentAccount.accountId}
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.85rem; color: #aaa;">Balance</div>
                <div style="font-weight: bold; font-size: 1.1rem;">
                    {logic.currentAccount.symbol}{logic.currentAccount.balance.balance.toFixed(2)}
                </div>
            </div>
        </div>
    {/if}

    {#if logic.isLoading}
        <p>Loading preferences...</p>
    {:else if logic.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
            {logic.error}
        </div>
    {:else if logic.data}
        <div style="background: #1a1a1a; padding: 1.5rem; border-radius: 8px; border: 1px solid #333;">

            {#if logic.message}
                <div style="color: #26a69a; border: 1px solid #26a69a; padding: 0.5rem; border-radius: 4px; margin-bottom: 1.5rem;">
                    {logic.message}
                </div>
            {/if}

            <div style="margin-bottom: 2rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" bind:checked={logic.hedging} />
                    <span style="font-weight: bold;">Hedging Mode</span>
                </label>
                <p style="font-size: 0.8rem; color: #888; margin-top: 0.25rem;">
                    If enabled, allows opening opposite positions for the same instrument.
                </p>
            </div>

            <h3 style="margin-bottom: 1rem; border-bottom: 1px solid #333; padding-bottom: 0.5rem;">Leverages</h3>

            <div style="display: grid; gap: 1.5rem;">
                {#each Object.entries(logic.data.leverages) as [category, info]}
                    <div>
                        <div style="margin-bottom: 0.5rem; font-weight: bold;">{category}</div>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            {#each info.available as option}
                                <button
                                        onclick={() => logic.leverages[category] = option}
                                        style="
                                        padding: 0.5rem 1rem;
                                        border: 1px solid {logic.leverages[category] === option ? 'white' : '#444'};
                                        background: {logic.leverages[category] === option ? '#444' : 'transparent'};
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
                        onclick={() => logic.save()}
                        disabled={logic.isSaving}
                        style="
                        padding: 0.75rem 2rem;
                        background-color: {logic.activeType === AUTH.REAL_TYPE ? '#26a69a' : '#ef5350'};
                        color: white;
                        border: none;
                        border-radius: 4px;
                        font-weight: bold;
                        cursor: pointer;
                        opacity: {logic.isSaving ? 0.7 : 1};
                    "
                >
                    {logic.isSaving ? 'Saving...' : 'Save Preferences'}
                </button>
            </div>

        </div>
    {/if}
</div>