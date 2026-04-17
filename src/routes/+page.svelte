<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { inventoryState } from '$lib/stores/inventory.svelte';

  onMount(() => inventoryState.refresh());

  const phases = [
    { n: 1, label: 'Scaffold', done: true, note: 'SvelteKit + Tailwind v4 + PWA' },
    { n: 2, label: 'Import', done: true, note: 'XLSX parsers + IndexedDB' },
    { n: 3, label: 'Find', done: false, note: 'Brand / type / lot / style / size chips' },
    { n: 4, label: 'Pick List', done: false, note: 'Orders, counts, persistence' },
    { n: 5, label: 'Classifications', done: false, note: 'Rule editor & unclassified queue' }
  ];
</script>

<svelte:head>
  <title>Gruppo Bravo</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col px-5 py-10">
  <header class="mb-8">
    <div class="mb-2 text-xs font-medium uppercase tracking-widest text-accent">
      v2 — rebuild
    </div>
    <h1 class="text-4xl font-bold tracking-tight text-ink sm:text-5xl">Gruppo Bravo</h1>
    <p class="mt-3 text-base text-muted">
      Inventory picking. Installable. Works offline.
    </p>
  </header>

  {#if inventoryState.inventoryCount > 0}
    <section class="mb-8 grid grid-cols-3 gap-3 text-center">
      <div class="rounded-xl border border-border bg-surface p-4">
        <div class="text-2xl font-bold text-ink">{inventoryState.inventoryCount}</div>
        <div class="mt-1 text-xs uppercase tracking-wider text-muted">Items</div>
      </div>
      <div class="rounded-xl border border-border bg-surface p-4">
        <div class="text-2xl font-bold text-ink">{inventoryState.unclassifiedCount}</div>
        <div class="mt-1 text-xs uppercase tracking-wider text-muted">To review</div>
      </div>
      <div class="rounded-xl border border-border bg-surface p-4">
        <div class="text-2xl font-bold text-ink">{inventoryState.fileCount}</div>
        <div class="mt-1 text-xs uppercase tracking-wider text-muted">Imports</div>
      </div>
    </section>
  {:else}
    <section class="mb-8 rounded-2xl border border-dashed border-border-strong bg-surface p-6 text-center">
      <div class="text-sm text-muted">No inventory loaded yet.</div>
      <a
        href="{base}/import/"
        class="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Import a file
      </a>
    </section>
  {/if}

  <section class="mb-10 rounded-2xl border border-border bg-surface p-6 shadow-sm">
    <h2 class="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-soft">
      Build status
    </h2>
    <ol class="space-y-3">
      {#each phases as p}
        <li class="flex items-start gap-3">
          <span
            class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            class:bg-accent={p.done}
            class:text-white={p.done}
            class:bg-surface-2={!p.done}
            class:text-muted={!p.done}
            class:border={!p.done}
            class:border-border={!p.done}
          >
            {p.done ? '✓' : p.n}
          </span>
          <div class="min-w-0">
            <div class="font-medium text-ink">{p.label}</div>
            <div class="text-sm text-muted">{p.note}</div>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <footer class="mt-auto pt-4 text-center text-xs text-muted">
    <a
      class="hover:text-accent"
      href="https://github.com/braenriquez/picker-app"
      target="_blank"
      rel="noreferrer"
    >
      github.com/braenriquez/picker-app
    </a>
  </footer>
</main>
