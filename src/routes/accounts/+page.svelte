<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { page } from '$app/state';
    import { accountStore } from '$lib/domains/trading/stores/AccountStore.svelte.js';
    import { session } from '$lib/core/services/SessionManager.js';
    import * as AUTH from '$lib/shared/constants/auth.js';

    import AccountCard from '$lib/domains/trading/components/AccountCard.svelte';
    import type { Account } from '$lib/shared/types/account.js';

    onMount(async () => {
        await accountStore.loadAll();

        // Handle scroll after data is loaded
        const hash = page.url.hash;
        if (hash) {
            // Wait for DOM update
            await tick();
            const id = hash.substring(1); // remove #
            const el = document.getElementById(id);
            if (el) {
                // Ensure browser paint is complete for geometry to be valid
                setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
            }
        }
    });

    // Helper: Is this the account currently being used for this mode?
    function isTradingAccount(account: Account, type: string) {
        return account.preferred && session.mode === type;
    }

    // Helper: Check if we have data to show
    function hasData() {
        return accountStore.realAccounts.length > 0 || accountStore.demoAccounts.length > 0;
    }
</script>

<div class="page-container">
    <div class="header">
        <h1>Accounts</h1>
        <a href="/" class="back-link">← Back</a>
    </div>

    {#if accountStore.isLoading && !hasData()}
        <p>Loading...</p>
    {:else}

        {#if accountStore.error}
            <div class="error-box">
                {accountStore.error}
            </div>
        {/if}

        <div class="lists-container" style="opacity: {accountStore.isLoading ? 0.5 : 1}; transition: opacity 0.2s;">
            <section>
                <h2 class="section-title real">Real Accounts</h2>
                {#if accountStore.realAccounts.length === 0}
                    <p class="empty">No real accounts found.</p>
                {:else}
                    <div class="grid">
                        {#each accountStore.realAccounts as account (account.accountId)}
                            {@const isActive = isTradingAccount(account, AUTH.REAL_TYPE)}
                            <AccountCard
                                    id={account.accountId}
                                    {account}
                                    mode={AUTH.REAL_TYPE}
                                    isActive={isActive}
                                    href={isActive ? `/preferences?type=${AUTH.REAL_TYPE}` : undefined}
                                    actionLabel={!isActive ? 'Switch' : undefined}
                                    onAction={() => accountStore.switchTo(account, AUTH.REAL_TYPE)}
                            />
                        {/each}
                    </div>
                {/if}
            </section>

            <section>
                <h2 class="section-title demo">Demo Accounts</h2>
                {#if accountStore.demoAccounts.length === 0}
                    <p class="empty">No demo accounts found.</p>
                {:else}
                    <div class="grid">
                        {#each accountStore.demoAccounts as account (account.accountId)}
                            {@const isActive = isTradingAccount(account, AUTH.DEMO_TYPE)}
                            <AccountCard
                                    id={account.accountId}
                                    {account}
                                    mode={AUTH.DEMO_TYPE}
                                    isActive={isActive}
                                    href={isActive ? `/preferences?type=${AUTH.DEMO_TYPE}` : undefined}
                                    actionLabel={!isActive ? 'Switch' : undefined}
                                    onAction={() => accountStore.switchTo(account, AUTH.DEMO_TYPE)}
                            />
                        {/each}
                    </div>
                {/if}
            </section>
        </div>
    {/if}
</div>

<style>
    .page-container { padding: 1rem; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    .back-link { color: #d1d4dc; }

    .error-box { color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px; margin-bottom: 2rem; }

    .lists-container { display: flex; flex-direction: column; gap: 3rem; }

    .section-title { padding-bottom: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid; }
    .section-title.real { color: #26a69a; border-color: #26a69a; }
    .section-title.demo { color: #ef5350; border-color: #ef5350; }

    .grid { display: grid; gap: 0; }
    .empty { color: #888; }
</style>