<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '$lib/styles.css';
	import Viewport from '$lib/debug/Viewport.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<Viewport />
