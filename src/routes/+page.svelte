<script lang="ts">
  import { base } from '$app/paths';

  const phases = [
    { n: 1, label: 'Scaffold', done: true, note: 'SvelteKit + Tailwind v4 + PWA' },
    { n: 2, label: 'Import', done: false, note: 'XLSX upload, brand parsers, IndexedDB' },
    { n: 3, label: 'Find', done: false, note: 'Brand / type / lot / style / size chips' },
    { n: 4, label: 'Pick List', done: false, note: 'Orders, counts, persistence' },
    { n: 5, label: 'Classifications', done: false, note: 'Rule editor & unclassified queue' }
  ];
</script>

<svelte:head>
  <title>Gruppo Bravo</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-10">
  <header class="mb-10">
    <div class="mb-2 text-xs font-medium uppercase tracking-widest text-accent">
      v2 — rebuild
    </div>
    <h1 class="text-4xl font-bold tracking-tight text-ink sm:text-5xl">Gruppo Bravo</h1>
    <p class="mt-3 text-base text-muted">
      Inventory picking. Installable. Works offline.
    </p>
  </header>

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

  <section class="mb-10 rounded-2xl border border-border bg-surface p-6 shadow-sm">
    <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
      Install
    </h2>
    <p class="text-sm text-ink-soft">
      Open this page in mobile Safari or Chrome and choose
      <span class="font-medium text-ink">Add to Home Screen</span>. It will launch
      like a native app — no browser chrome, splash screen, and usable without a
      network connection after first load.
    </p>
  </section>

  <footer class="mt-auto pt-8 text-center text-xs text-muted">
    <a
      class="hover:text-accent"
      href="https://github.com/braenriquez/picker-app"
      target="_blank"
      rel="noreferrer"
    >
      github.com/braenriquez/picker-app
    </a>
    <span class="mx-2">·</span>
    <span>base: {base || '/'}</span>
  </footer>
</main>
