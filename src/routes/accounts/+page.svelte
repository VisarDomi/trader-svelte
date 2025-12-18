<script lang="ts">
    import { onMount } from 'svelte';
    import { Accounts } from './logic.svelte.js';

    const accounts = new Accounts();

    onMount(() => {
        accounts.init();
    });
</script>

<div style="padding: 1rem; max-width: 800px; margin: 0 auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>Accounts</h1>
        <a href="/" style="color: #d1d4dc;">← Back</a>
    </div>

    {#if accounts.isLoading}
        <p>Loading accounts...</p>
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
                            <div style="background: #1a1a1a; padding: 1rem; border-radius: 8px; border: 1px solid #333;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                                    <span style="font-weight: bold;">{account.accountName} ({account.currency})</span>
                                    <span style="font-size: 0.8em; color: #888;">{account.status}</span>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                                    <div>
                                        <div style="color: #888;">Balance</div>
                                        <div>{account.symbol}{account.balance.balance.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">Available</div>
                                        <div>{account.symbol}{account.balance.available.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">P&L</div>
                                        <div style="color: {account.balance.profitLoss >= 0 ? '#26a69a' : '#ef5350'}">
                                            {account.balance.profitLoss.toFixed(2)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">Deposit</div>
                                        <div>{account.symbol}{account.balance.deposit.toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
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
                            <div style="background: #1a1a1a; padding: 1rem; border-radius: 8px; border: 1px solid #333;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                                    <span style="font-weight: bold;">{account.accountName} ({account.currency})</span>
                                    <span style="font-size: 0.8em; color: #888;">{account.status}</span>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
                                    <div>
                                        <div style="color: #888;">Balance</div>
                                        <div>{account.symbol}{account.balance.balance.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">Available</div>
                                        <div>{account.symbol}{account.balance.available.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">P&L</div>
                                        <div style="color: {account.balance.profitLoss >= 0 ? '#26a69a' : '#ef5350'}">
                                            {account.balance.profitLoss.toFixed(2)}
                                        </div>
                                    </div>
                                    <div>
                                        <div style="color: #888;">Deposit</div>
                                        <div>{account.symbol}{account.balance.deposit.toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>

        </div>
    {/if}
</div>