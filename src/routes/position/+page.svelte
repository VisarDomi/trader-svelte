<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { session } from '$lib/services/session.js';
    import { positionStore } from '$lib/stores/position.svelte.js';
    import { accountStore } from '$lib/stores/account.svelte.js';

    import AccountCard from '$lib/components/AccountCard.svelte';
    import PositionCard from '$lib/components/position/PositionCard.svelte';
    import PositionDebug from '$lib/components/position/PositionDebug.svelte';

    let pollInterval: ReturnType<typeof setInterval>;

    onMount(async () => {
        const epic = session.lastEpic;
        if (epic) {
            await Promise.all([
                accountStore.init(),
                positionStore.init(epic)
            ]);
        }
        // Keep checking for PnL updates while looking at this page
        pollInterval = setInterval(() => {
            positionStore.refresh();
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
                badgeText={session.lastEpic}
        />
    {/if}

    {#if positionStore.isLoading && !positionStore.activePosition}
        <p>Loading position details...</p>
    {:else if positionStore.activePosition}
        <PositionCard data={positionStore.activePosition}>
            <!-- Slot Injection for Debug Info -->
            <PositionDebug positionResponse={positionStore.activePosition} />
        </PositionCard>
    {:else}
        <div class="empty-state">
            <p class="empty-text">No active position found for {session.lastEpic}.</p>
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