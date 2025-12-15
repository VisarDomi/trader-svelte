<script lang="ts">
    import * as AUTH from '$lib/constants/auth.js';
    import { CapitalAuthService, type AuthTokens } from '$lib/services/auth.js';

    let loginStatus = $state("Ready to login");
    let tokens = $state<AuthTokens | null>(null);

    async function handleLogin(type: typeof AUTH.DEMO_TYPE | typeof AUTH.REAL_TYPE) {
        try {
            loginStatus = `Logging into ${type}...`;
            tokens = null;

            const authService = new CapitalAuthService();
            tokens = await authService.login(type);

            loginStatus = `Success: Logged into ${type}`;
        } catch (e) {
            console.error(e);
            loginStatus = `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
    }
</script>

<h1>Authentication</h1>

<div style="border: 1px solid #ccc; padding: 1rem; margin-top: 1rem; border-radius: 8px;">
    <p>Status: <strong>{loginStatus}</strong></p>

    <div style="margin-top: 1rem; display: flex; gap: 1rem;">
        <button onclick={() => handleLogin(AUTH.DEMO_TYPE)}>Login DEMO</button>
        <button onclick={() => handleLogin(AUTH.REAL_TYPE)}>Login REAL</button>
    </div>

    {#if tokens}
        <div style="margin-top: 1rem; background: #eee; padding: 1rem; border-radius: 4px; overflow-x: auto;">
            <h3>Received Tokens:</h3>
            <pre>{JSON.stringify(tokens, null, 2)}</pre>
        </div>
    {/if}
</div>

<p style="margin-top: 1rem;"><a href="/">← Back Home</a></p>