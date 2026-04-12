<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { preferencesStore } from '$lib/domains/trading/stores/PreferencesStore.svelte.js';
    import * as AUTH from '$lib/shared/constants/auth.js';
    import type { URL_TYPE } from '$lib/shared/types/url.js';
    import { isShowcaseProfile } from '$lib/core/config/runtime.js';
    import { disableChartTrace, enableChartTrace, getChartTraceRemainingMs, isChartTraceEnabled } from '$lib/core/debug/chart-trace.js';
    import { session } from '$lib/core/services/SessionManager.js';
    import { SystemController } from '$lib/core/engine/SystemController.js';
    import { notifications } from '$lib/core/services/NotificationService.svelte.js';

    import AccountCard from '$lib/domains/trading/components/AccountCard.svelte';
    import LeverageGrid from '$lib/domains/trading/components/LeverageGrid.svelte';

    let traceTick = $state(0);
    let traceInterval: ReturnType<typeof setInterval> | null = null;

    const chartTraceEnabled = $derived.by(() => {
        traceTick;
        return isChartTraceEnabled();
    });

    const chartTraceLabel = $derived.by(() => {
        traceTick;
        if (!isChartTraceEnabled()) return 'Enable chart bug trace for 1h';
        const minutes = Math.max(1, Math.ceil(getChartTraceRemainingMs() / 60000));
        return `Disable chart bug trace (${minutes}m left)`;
    });

    onMount(() => {
        const type = page.url.searchParams.get('type') as URL_TYPE | null;
        const target = isShowcaseProfile()
            ? AUTH.DEMO_TYPE
            : (type === AUTH.REAL_TYPE || type === AUTH.DEMO_TYPE)
                ? type
                : AUTH.REAL_TYPE;

        preferencesStore.init(target);

        traceInterval = setInterval(() => {
            traceTick += 1;
        }, 60_000);
    });

    onDestroy(() => {
        if (traceInterval) {
            clearInterval(traceInterval);
            traceInterval = null;
        }
    });

    function toggleChartTrace() {
        if (isChartTraceEnabled()) disableChartTrace();
        else enableChartTrace();
        traceTick += 1;
    }

    async function logout() {
        SystemController.hibernate();
        session.clearAppSession();
        notifications.info('Session cleared');
        await goto('/login');
    }
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

                <div class="debug-box">
                    <div class="debug-copy">
                        <strong>Chart bug trace</strong>
                        <p>
                            Enables noisy viewport/render trace logs for one hour on this browser only.
                        </p>
                    </div>
                    <button
                            onclick={toggleChartTrace}
                            class="trace-btn"
                            aria-pressed={chartTraceEnabled}
                    >
                        {chartTraceLabel}
                    </button>
                </div>

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

                    <button
                            onclick={logout}
                            class="logout-btn"
                    >
                        Log Out
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

    .debug-box {
        margin-top: 2rem;
        padding: 1rem;
        border: 1px solid #333;
        border-radius: 8px;
        display: flex;
        gap: 1rem;
        align-items: center;
        justify-content: space-between;
    }
    .debug-copy p {
        margin: 0.35rem 0 0;
        font-size: 0.8rem;
        color: #888;
        max-width: 30rem;
    }
    .trace-btn {
        padding: 0.75rem 1rem;
        background: transparent;
        border: 1px solid #444;
        color: #ccc;
        border-radius: 4px;
        cursor: pointer;
        white-space: nowrap;
    }
    .trace-btn:hover {
        border-color: #26a69a;
        color: #26a69a;
    }

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

    .logout-btn {
        padding: 0.75rem 1.25rem;
        background: transparent;
        border: 1px solid #555;
        color: #ddd;
        border-radius: 4px;
        cursor: pointer;
    }
    .logout-btn:hover {
        border-color: #ef5350;
        color: #ef5350;
    }

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
