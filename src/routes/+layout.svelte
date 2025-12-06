<script lang="ts">
	import '$lib/styles.css';
	import Viewport from '$lib/dimensions/Viewport.svelte';

	let { children } = $props();
</script>

<Viewport />
{@render children()}
