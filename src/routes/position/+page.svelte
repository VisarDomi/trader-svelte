<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { session } from '$lib/core/services/SessionManager.js';
    import { positionStore } from '$lib/domains/trading/stores/PositionStore.svelte.js';
    import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
    import { positionPoller } from '$lib/domains/trading/services/PositionPoller.js';

    import AccountCard from '$lib/domains/trading/components/AccountCard.svelte';
    import PositionCard from '$lib/domains/trading/components/PositionCard.svelte';

    let pollInterval: ReturnType<typeof setInterval>;

    onMount(async () => {
        const epic = session.lastEpic;
        if (epic) {
            // Configure poller context
            positionPoller.setEpic(epic);

            await Promise.all([
                accountStore.init(),
                // Manual refresh on mount
                positionPoller.refresh()
            ]);
        }

        // Local polling for UI responsiveness
        pollInterval = setInterval(() => {
            positionPoller.refresh();
        }, 1000);
    });

    onDestroy(() => {
        clearInterval(pollInterval);
    });
</script>

<div class="page-container">
    <div class="nav-header">
        <h1>Current Position</h1>
        <a href="/chart" class="back-link">← Chart</a>
    </div>

    {#if accountStore.activeAccount}
        <AccountCard
                account={accountStore.activeAccount}
                mode={session.mode}
                badgeText={positionStore.anyActivePosition ? positionStore.anyActivePosition.market.epic : session.lastEpic}
        />
    {/if}

    {#if positionStore.isLoading && !positionStore.anyActivePosition}
        <p>Loading position details...</p>
    {:else if positionStore.anyActivePosition}
        <PositionCard data={positionStore.anyActivePosition} />
    {:else}
        <div class="empty-state">
            <p class="empty-text">No active position found on this account.</p>
            <a href="/chart" class="chart-link">Open Chart</a>
        </div>
    {/if}
</div>

<style>
    .page-container {
        padding: 1rem;
        max-width: 800px;
        margin: 0 auto;
    }
    .nav-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }
    .back-link { color: #d1d4dc; }

    .empty-state {
        text-align: center;
        padding: 3rem;
        background: #1a1a1a;
        border-radius: 8px;
    }
    .empty-text { color: #888; }
    .chart-link {
        display: block;
        margin-top: 1rem;
        color: #26a69a;
        text-decoration: none;
    }
</style>