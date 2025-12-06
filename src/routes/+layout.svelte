<script lang="ts">
	import '$lib/styles.css';
	import Viewport from '$lib/dimensions/Viewport.svelte';

	let { children } = $props();
</script>

<svelte:head>
    <title>Moon Tendies</title>
</svelte:head>

<Viewport />
{@render children()}
