<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { authenticateAndStoreSession } from "$lib/services/auth.js";
    onMount(async () => {
        try {
            await authenticateAndStoreSession();
            const search = page.url.search;
            await goto(`/chart${search}`);
        } catch (e) {
            await goto('/login');
        }
    });
</script>

<div style="display: flex; justify-content: center; align-items: center; height: 100vh; background-color: black; color: #d1d4dc;">
    <p>Loading...</p>
</div>