<script lang="ts">
    import * as BACKEND from '$lib/constants/backend.js';

    let message = $state("Connecting to backend...");
    let time = $state<number | null>(null);

    $effect(() => {
        async function fetchData() {
            try {
                const res = await fetch(`${BACKEND.URL}${BACKEND.HELLO}`);
                const data = await res.json();

                message = data.message;
                time = data.time;
            } catch (err) {
                console.error(err);
                message = "Failed to connect to backend.";
            }
        }

        fetchData();
    });
</script>

<h1>Trader Svelte</h1>

<div>
    <img src="/1.png" alt="manga page 1">
    <img src="/2.png" alt="manga page 2">
    <img src="/3.png" alt="manga page 3">
</div>

<div style="border: 1px solid #ccc; padding: 1rem; margin-top: 1rem; border-radius: 8px;">
    <h2>Backend Status:</h2>
    <p><strong>Message:</strong> {message}</p>
    {#if time}
        <p><strong>Server Time:</strong> {new Date(time).toLocaleString()}</p>
    {/if}
</div>

<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>