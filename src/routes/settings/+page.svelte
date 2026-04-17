<script lang="ts">
  // Settings / Classifications — two sections:
  //   1. "Needs Review": unclassified models awaiting a category pick.
  //      Selecting a category promotes every matching unclassified row to
  //      inventory and records the choice in memory.
  //   2. "Learned": memory overrides already in place. Dropdown reassigns,
  //      × drops the override and re-runs DEFAULT_RULES (which may demote
  //      inventory back to the review queue).
  import { onMount } from 'svelte';
  import { classificationsState } from '$lib/stores/classifications.svelte';
  import { inventoryState } from '$lib/stores/inventory.svelte';
  import { inventoryData } from '$lib/stores/inventory-data.svelte';
  import { toastState } from '$lib/stores/toast.svelte';
  import { CATEGORIES, type Category, type RawCategory } from '$lib/types';
  import { truncateLot } from '$lib/find-helpers';

  onMount(() => {
    classificationsState.load();
    inventoryState.refresh();
  });

  async function onResolve(model: string, e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    if (!v || !CATEGORIES.includes(v as Category)) return;
    const res = await classificationsState.resolve(model, v as Category);
    await Promise.all([inventoryState.refresh(), inventoryData.load()]);
    const bits: string[] = [];
    if (res.promoted) bits.push(`${res.promoted} classified`);
    if (res.updated) bits.push(`${res.updated} updated`);
    toastState.show(bits.length ? bits.join(' · ') : 'Saved');
  }

  async function onReassign(model: string, e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    if (!v || !CATEGORIES.includes(v as Category)) return;
    await classificationsState.reassign(model, v as Category);
    await Promise.all([inventoryState.refresh(), inventoryData.load()]);
    toastState.show('Reassigned');
  }

  async function onForget(model: string) {
    const res = await classificationsState.forget(model);
    await Promise.all([inventoryState.refresh(), inventoryData.load()]);
    if (res.newCategory === '__UNCLASSIFIED__') {
      toastState.show(`Forgotten — ${res.moved} moved to review`);
    } else {
      toastState.show('Forgotten');
    }
  }

  function categoryLabel(c: RawCategory): string {
    if (c === '__SKIP__') return 'Skip';
    if (c === '__UNCLASSIFIED__') return 'Unclassified';
    return c;
  }
</script>

<svelte:head><title>Settings — Gruppo Bravo</title></svelte:head>

<main class="mx-auto w-full max-w-2xl px-5 pt-6 pb-10">
  <header class="mb-5">
    <h1 class="text-2xl font-bold tracking-tight text-ink">Settings</h1>
    <p class="mt-1 text-sm text-muted">
      Teach the app how to classify unfamiliar models. Choices are remembered
      and applied to future imports.
    </p>
  </header>

  <!-- Needs Review -->
  <section class="mb-6">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Needs Review</h2>
      {#if classificationsState.reviewGroups.length > 0}
        <span class="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
          {classificationsState.reviewCount}
        </span>
      {/if}
    </div>

    {#if !classificationsState.loaded && classificationsState.loading}
      <div class="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
        Loading…
      </div>
    {:else if classificationsState.reviewGroups.length === 0}
      <div class="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
        Nothing to review — every imported model has a category.
      </div>
    {:else}
      <ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {#each classificationsState.reviewGroups as g (g.model)}
          <li class="flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-accent-ink">{g.model}</div>
              <div class="truncate text-[11px] text-muted">
                {g.items.length} {g.items.length === 1 ? 'row' : 'rows'}
                {#if g.items[0]?.brand}
                  · {g.items[0].brand}
                  {#if g.items[0]?.lot}
                    · Lot {truncateLot(g.items[0].lot)}
                  {/if}
                {/if}
              </div>
            </div>
            <select
              class="shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              value=""
              onchange={(e) => onResolve(g.model, e)}
            >
              <option value="">Classify…</option>
              {#each CATEGORIES as c (c)}
                <option value={c}>{c}</option>
              {/each}
            </select>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Learned -->
  <section class="mb-6">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Learned</h2>
      {#if classificationsState.learned.length > 0}
        <span class="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
          {classificationsState.learned.length}
        </span>
      {/if}
    </div>

    {#if classificationsState.learned.length === 0}
      <div class="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
        Models you've manually classified will appear here so you can edit or
        forget them.
      </div>
    {:else}
      <ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {#each classificationsState.learned as m (m.model)}
          <li class="flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-ink">{m.model}</div>
              <div class="truncate text-[11px] text-muted">Classified as {categoryLabel(m.category)}</div>
            </div>
            <select
              class="shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              value={m.category as string}
              onchange={(e) => onReassign(m.model, e)}
            >
              {#each CATEGORIES as c (c)}
                <option value={c}>{c}</option>
              {/each}
            </select>
            <button
              type="button"
              aria-label="Forget"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-red-50 hover:text-danger active:scale-95"
              onclick={() => onForget(m.model)}
            >
              ×
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Built-in rules note -->
  <section class="mb-6 rounded-2xl border border-border bg-surface-2 p-4 text-xs text-muted">
    <div class="mb-1 font-semibold uppercase tracking-wider text-ink-soft">Built-in rules</div>
    A curated set of regex rules covers common patterns (Tuxedo/TUX →&nbsp;Suit,
    Rental&nbsp;Vest →&nbsp;Vest, BOYS.* →&nbsp;Boys, and so on). Memory overrides always
    win; these rules fill in the rest automatically.
  </section>
</main>
