<script lang="ts">
    import { onMount } from 'svelte';
    import { Accounts } from './logic.svelte.js';
    import * as AUTH from '$lib/constants/auth.js';
    const accounts = new Accounts();
    onMount(() => {
        accounts.init();
    });
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Accounts</h1>
        <div style="display: flex; gap: 1rem;">
            <a href="/preferences" style="color: #26a69a;">Preferences</a>
            <a href="/" style="color: #d1d4dc;">← Back</a>
        </div>
    </div>

    {#if accounts.isLoading}
        <p>Loading...</p>
    {:else if accounts.error}
        <div style="color: #ef5350; border: 1px solid #ef5350; padding: 1rem; border-radius: 4px;">
            {accounts.error}
        </div>
    {:else}
        <div style="display: flex; flex-direction: column; gap: 2rem;">

            <section>
                <h2 style="color: #26a69a; border-bottom: 1px solid #26a69a; padding-bottom: 0.5rem; margin-bottom: 1rem;">
                    Real Accounts
                </h2>
                {#if accounts.realAccounts.length === 0}
                    <p>No real accounts found.</p>
                {:else}
                    <div style="display: grid; gap: 1rem;">
                        {#each accounts.realAccounts as account}
                            <svelte:element
                                    this={account.preferred ? 'a' : 'div'}
                                    href={account.preferred ? `/preferences?type=${AUTH.REAL_TYPE}` : undefined}
                                    style="
                                    display: block;
                                    text-decoration: none;
                                    color: inherit;
                                    background: #1a1a1a;
                                    padding: 1rem;
                                    border-radius: 8px;
                                    border: 1px solid #333;
                                    text-align: left;
                                    width: 100%;
                                    cursor: {account.preferred ? 'pointer' : 'default'};
                                    {account.preferred ? 'border-color: #26a69a;' : ''}
                                "
                            >
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                                    <span style="font-weight: bold; color: white; font-size: 1rem;">{account.accountName} ({account.currency})</span>
                                    <div style="display: flex; gap: 1rem; align-items: center;">
                                        <span style="font-size: 0.8em; color: #888;">{account.status}</span>
                                        {#if !account.preferred}
                                            <button
                                                    onclick={(e) => {
                                                    e.stopPropagation();
                                                    accounts.switchTo(account, AUTH.REAL_TYPE);
                                                }}
                                                style="padding: 4px 8px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;"
                                            >
                                                Switch
                                            </button>
                                        {:else}
                                            <span style="font-size: 0.8rem; color: #26a69a;">Active</span>
                                        {/if}
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                                    <div>
                                        <div style="color: #888;">Balance</div>
                                        <div style="color: white;">{account.symbol}{account.balance.balance.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">Available</div>
                                        <div style="color: white;">{account.symbol}{account.balance.available.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">P&L</div>
                                        <div style="color: {account.balance.profitLoss >= 0 ? '#26a69a' : '#ef5350'}">
                                            {account.balance.profitLoss.toFixed(2)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">Deposit</div>
                                        <div style="color: white;">{account.symbol}{account.balance.deposit.toFixed(2)}</div>
                                    </div>
                                </div>
                            </svelte:element>
                        {/each}
                    </div>
                {/if}
            </section>

            <section>
                <h2 style="color: #ef5350; border-bottom: 1px solid #ef5350; padding-bottom: 0.5rem; margin-bottom: 1rem;">
                    Demo Accounts
                </h2>
                {#if accounts.demoAccounts.length === 0}
                    <p>No demo accounts found.</p>
                {:else}
                    <div style="display: grid; gap: 1rem;">
                        {#each accounts.demoAccounts as account}
                            <svelte:element
                                this={account.preferred ? 'a' : 'div'}
                                href={account.preferred ? `/preferences?type=${AUTH.DEMO_TYPE}` : undefined}
                                style="
                                    display: block;
                                    text-decoration: none;
                                    color: inherit;
                                    background: #1a1a1a;
                                    padding: 1rem;
                                    border-radius: 8px;
                                    border: 1px solid #333;
                                    text-align: left;
                                    width: 100%;
                                    cursor: {account.preferred ? 'pointer' : 'default'};
                                    {account.preferred ? 'border-color: #ef5350;' : ''}
                                "
                            >
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                                    <span style="font-weight: bold; color: white; font-size: 1rem;">{account.accountName} ({account.currency})</span>
                                    <div style="display: flex; gap: 1rem; align-items: center;">
                                        <span style="font-size: 0.8em; color: #888;">{account.status}</span>
                                        {#if !account.preferred}
                                            <button
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    accounts.switchTo(account, AUTH.DEMO_TYPE);
                                                }}
                                                style="padding: 4px 8px; background: #333; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;"
                                            >
                                                Switch
                                            </button>
                                        {:else}
                                            <span style="font-size: 0.8rem; color: #ef5350;">Active</span>
                                        {/if}
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                                    <div>
                                        <div style="color: #888;">Balance</div>
                                        <div style="color: white;">{account.symbol}{account.balance.balance.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">Available</div>
                                        <div style="color: white;">{account.symbol}{account.balance.available.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">P&L</div>
                                        <div style="color: {account.balance.profitLoss >= 0 ? '#26a69a' : '#ef5350'}">
                                            {account.balance.profitLoss.toFixed(2)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">Deposit</div>
                                        <div style="color: white;">{account.symbol}{account.balance.deposit.toFixed(2)}</div>
                                    </div>
                                </div>
                            </svelte:element>
                        {/each}
                    </div>
                {/if}
            </section>

        </div>
    {/if}

    {#if accounts.toastMessage}
        <div style="
            position: fixed;
            bottom: 2rem;
            left: 50%;
            transform: translateX(-50%);
            background: #333;
            color: white;
            padding: 1rem 2rem;
            border-radius: 8px;
            border: 1px solid #26a69a;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            z-index: 1000;
            font-weight: bold;
            animation: fadeInOut 3s forwards;
        ">
            {accounts.toastMessage}
        </div>
    {/if}
</div>

<style>
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, 1rem); }
        10% { opacity: 1; transform: translate(-50%, 0); }
        90% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -1rem); }
    }
</style>