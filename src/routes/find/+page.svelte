<script lang="ts">
  import { onMount } from 'svelte';
  import { inventoryState } from '$lib/stores/inventory.svelte';
  import { base } from '$app/paths';

  onMount(() => inventoryState.refresh());
</script>

<svelte:head><title>Find — Gruppo Bravo</title></svelte:head>

<main class="mx-auto w-full max-w-2xl px-5 py-8">
  <h1 class="mb-2 text-2xl font-bold tracking-tight text-ink">Find</h1>
  <p class="mb-6 text-sm text-muted">
    Brand / type / lot / style filters and size chips. Coming in phase 3.
  </p>
  <div class="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
    {#if inventoryState.inventoryCount === 0}
      No inventory yet. <a class="text-accent hover:underline" href="{base}/import/">Import a file</a>
      to get started.
    {:else}
      <div class="text-ink"><span class="font-semibold">{inventoryState.inventoryCount}</span> items loaded.</div>
      <div class="mt-2">Filter UI will live here.</div>
    {/if}
  </div>
</main>
