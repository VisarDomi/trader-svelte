<script lang="ts">
    import { onMount } from 'svelte';
    import { Login } from './logic.svelte.js';
    const login = new Login();
    onMount(login.init);
</script>

<h1>Authentication</h1>

<div style="max-width: 400px; display: flex; flex-direction: column; gap: 0.5rem;">
    <p style="font-size: 0.8rem; color: #666;">
        Enter your credentials once. These will be used to authenticate against both Real (for charts) and Demo (for trading).
    </p>

    <label>
        API Key
        <input type="text" bind:value={login.apiKey} placeholder="X-CAP-API-KEY" style="width: 100%; padding: 8px;" />
    </label>
    <label>
        Identifier
        <input type="text" bind:value={login.identifier} placeholder="user@example.com" style="width: 100%; padding: 8px;" />
    </label>
    <label>
        Password
        <input type="password" bind:value={login.password} placeholder="password" style="width: 100%; padding: 8px;" />
    </label>

    <button onclick={() => login.loginBoth()} style="padding: 1rem; background-color: #26a69a; color: white; border: none; font-weight: bold; cursor: pointer;">
        LOGIN TO BOTH
    </button>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 2rem;">
    <!-- REAL STATUS -->
    <div style="border: 1px solid #26a69a; padding: 1rem; border-radius: 8px;">
        <h3>REAL (Charts)</h3>
        <p>Status: <strong>{login.realStatus}</strong></p>
        <button onclick={() => login.retryReal()}>Retry Real</button>
        {#if login.realTokens}<div style="font-size: 0.7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 5px; color: green;">Token: {login.realTokens.cst.substring(0,100)}...</div>{/if}
    </div>

    <!-- DEMO STATUS -->
    <div style="border: 1px solid #ef5350; padding: 1rem; border-radius: 8px;">
        <h3>DEMO (Trading)</h3>
        <p>Status: <strong>{login.demoStatus}</strong></p>
        <button onclick={() => login.retryDemo()}>Retry Demo</button>
        {#if login.demoTokens}<div style="font-size: 0.7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 5px; color: green;">Token: {login.demoTokens.cst.substring(0,100)}...</div>{/if}
    </div>
</div>

<p style="margin-top: 1rem;"><a href="/">← Back Home</a></p>