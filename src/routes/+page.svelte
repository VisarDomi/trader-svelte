<script lang="ts">
    let message = $state("Connecting to backend...");
    let time = $state<number | null>(null);

    // Fetch data when component loads
    $effect(() => {
        async function fetchData() {
            try {
                // Direct fetch to your backend IP and Port
                const res = await fetch('https://192.168.1.197:35687/api/hello');
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
    <img src="/1.png" alt="mangaimage1">
    <img src="/2.png" alt="mangaimage2">
    <img src="/3.png" alt="mangaimage3">
</div>

<div style="border: 1px solid #ccc; padding: 1rem; margin-top: 1rem; border-radius: 8px;">
    <h2>Backend Status:</h2>
    <p><strong>Message:</strong> {message}</p>
    {#if time}
        <p><strong>Server Time:</strong> {new Date(time).toLocaleString()}</p>
    {/if}
</div>

<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>