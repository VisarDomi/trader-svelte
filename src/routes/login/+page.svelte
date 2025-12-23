<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { authStore } from '$lib/stores/auth.svelte.js';

    onMount(() => {
        authStore.init();
    });

    async function handleLogin() {
        await authStore.loginBoth();

        if (authStore.realTokens && authStore.demoTokens) {
           void goto('/chart');
        }
    }
</script>

<h1>Authentication</h1>

<div style="max-width: 400px; display: flex; flex-direction: column; gap: 0.5rem;">
    <p style="font-size: 0.8rem; color: #666;">
        Enter your credentials once. These will be used to authenticate against both Real (for charts) and Demo (for trading).
    </p>

    <label>
        API Key
        <!-- font-size: 16px is the magic number that prevents iOS Safari from zooming in on focus -->
        <input type="text" bind:value={authStore.apiKey} placeholder="X-CAP-API-KEY" style="width: 100%; padding: 8px; font-size: 16px;" />
    </label>
    <label>
        Identifier
        <input type="text" bind:value={authStore.identifier} placeholder="user@example.com" style="width: 100%; padding: 8px; font-size: 16px;" />
    </label>
    <label>
        Password
        <input type="password" bind:value={authStore.password} placeholder="password" style="width: 100%; padding: 8px; font-size: 16px;" />
    </label>

    <button onclick={handleLogin} style="padding: 1rem; background-color: #26a69a; color: white; border: none; font-weight: bold; cursor: pointer;">
        LOGIN TO BOTH
    </button>
</div>

<div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 2rem; max-width: 100%;">
    <!-- REAL STATUS -->
    <div style="border: 1px solid #26a69a; padding: 1rem; border-radius: 8px;">
        <h3>REAL (Charts default)</h3>
        <p>Status: <strong>{authStore.realStatus}</strong></p>
        <button onclick={() => authStore.retryReal()}>Retry Real</button>
        {#if authStore.realTokens}
            <div style="
                font-size: 0.7rem;
                margin-top: 5px;
                color: green;
                word-break: break-all;
                white-space: normal;
            ">
                Connected
            </div>
        {/if}
    </div>

    <!-- DEMO STATUS -->
    <div style="border: 1px solid #ef5350; padding: 1rem; border-radius: 8px;">
        <h3>DEMO (Trading default)</h3>
        <p>Status: <strong>{authStore.demoStatus}</strong></p>
        <button onclick={() => authStore.retryDemo()}>Retry Demo</button>
        {#if authStore.demoTokens}
            <div style="
                font-size: 0.7rem;
                margin-top: 5px;
                color: green;
                word-break: break-all;
                white-space: normal;
            ">
                Connected
            </div>
        {/if}
    </div>
</div>