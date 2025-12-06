<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '$lib/styles.css';
	import Viewport from '$lib/dimensions/Viewport.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Viewport />
{@render children()}
