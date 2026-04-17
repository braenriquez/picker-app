<script lang="ts">
  // The Find page: brand → type → lot → style narrows inventory to a single
  // Item, then the user taps size chips to queue qty. When any chip has a
  // non-zero count, a sticky bottom bar offers "Add to Pick List". All
  // selection lives in `filterState` (singleton) so navigating away and back
  // preserves context.
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { CATEGORIES, type Category, type Item, type PickListEntry } from '$lib/types';
  import { inventoryData } from '$lib/stores/inventory-data.svelte';
  import { filterState } from '$lib/stores/filter.svelte';
  import { toastState } from '$lib/stores/toast.svelte';
  import { addToPickList } from '$lib/db';
  import {
    sizeTypesForEntry,
    sizeMapFor,
    meaningfulFlag,
    balancedRows,
    truncateLot
  } from '$lib/find-helpers';

  onMount(() => {
    if (!inventoryData.loaded) inventoryData.load();
  });

  // ── Derived filter cascades ──────────────────────────────────────────────

  const brands = $derived(
    Array.from(new Set(inventoryData.all.map((i) => i.brand))).sort((a, b) => a.localeCompare(b))
  );

  const typesForBrand = $derived.by<Category[]>(() => {
    if (!filterState.brand) return [];
    const set = new Set<Category>();
    for (const i of inventoryData.all) if (i.brand === filterState.brand) set.add(i.category);
    return CATEGORIES.filter((c) => set.has(c));
  });

  const lotsForBrandType = $derived.by<string[]>(() => {
    if (!filterState.brand || !filterState.type) return [];
    const set = new Set<string>();
    for (const i of inventoryData.all) {
      if (i.brand === filterState.brand && i.category === filterState.type) set.add(i.lot);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  const stylesForLot = $derived.by<string[]>(() => {
    if (!filterState.brand || !filterState.type || !filterState.lot) return [];
    const set = new Set<string>();
    for (const i of inventoryData.all) {
      if (
        i.brand === filterState.brand &&
        i.category === filterState.type &&
        i.lot === filterState.lot
      ) {
        set.add(i.model);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  /** The currently-resolved inventory entry, if filters narrow to exactly one
   *  row. `null` otherwise (zero or ambiguous). */
  const entry = $derived.by<Item | null>(() => {
    if (!filterState.brand || !filterState.type || !filterState.lot) return null;
    const matches = inventoryData.all.filter(
      (i) =>
        i.brand === filterState.brand &&
        i.category === filterState.type &&
        i.lot === filterState.lot &&
        (!filterState.style || i.model === filterState.style)
    );
    if (matches.length === 1) return matches[0];
    return null;
  });

  const sizeTabs = $derived(entry ? sizeTypesForEntry(entry) : []);
  const currentSizeMap = $derived.by<Record<string, number>>(() => {
    if (!entry || !filterState.sizeType) return {};
    return sizeMapFor(entry, filterState.sizeType);
  });

  const sizeRows = $derived.by(() => {
    const keys = Object.keys(currentSizeMap);
    // Preserve insertion order from the source map — it already reflects
    // column order from the XLSX, which is semantically sorted.
    return balancedRows(keys);
  });

  const infoFlag = $derived(entry ? meaningfulFlag(entry.flag) : null);

  // ── Cascade reset effects ────────────────────────────────────────────────
  // When an upstream filter changes, downstream selections must drop. Done
  // with $effect and guards to avoid loops.

  $effect(() => {
    // If current type isn't available for brand, clear it.
    if (filterState.brand && filterState.type && !typesForBrand.includes(filterState.type as Category)) {
      filterState.type = typesForBrand[0] ?? '';
    }
  });

  $effect(() => {
    // Ensure sizeType is valid for the current entry.
    if (!entry) {
      if (filterState.sizeType) filterState.sizeType = '';
      return;
    }
    const tabs = sizeTypesForEntry(entry);
    if (!tabs.length) {
      filterState.sizeType = '';
      return;
    }
    if (!tabs.find((t) => t.key === filterState.sizeType)) {
      filterState.sizeType = tabs[0].key;
    }
  });

  // ── UI handlers ─────────────────────────────────────────────────────────

  function selectBrand(br: string) {
    if (filterState.brand === br) return;
    filterState.brand = br;
    // Keep type if available in new brand; else pick first.
    filterState.lot = '';
    filterState.style = '';
    filterState.sizeType = '';
    filterState.resetChips();
  }

  function selectType(t: Category) {
    if (filterState.type === t) return;
    filterState.type = t;
    filterState.lot = '';
    filterState.style = '';
    filterState.sizeType = '';
    filterState.resetChips();
  }

  function onLotChange(e: Event) {
    filterState.lot = (e.currentTarget as HTMLSelectElement).value;
    filterState.style = '';
    filterState.sizeType = '';
    filterState.resetChips();
  }

  function onStyleChange(e: Event) {
    filterState.style = (e.currentTarget as HTMLSelectElement).value;
    filterState.sizeType = '';
    filterState.resetChips();
  }

  function pickSizeTab(key: string) {
    if (filterState.sizeType === key) return;
    filterState.sizeType = key;
  }

  // Long-press tracking for chip clear (right-click also clears on desktop).
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressCleared = false;

  function onChipPressStart(size: string) {
    pressCleared = false;
    pressTimer = setTimeout(() => {
      filterState.clearChip(size);
      pressCleared = true;
      // Light haptic if available.
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(20);
    }, 450);
  }

  function onChipPressEnd(size: string, stock: number) {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    if (pressCleared) return;
    filterState.tapChip(size, stock);
  }

  function onChipContextMenu(e: MouseEvent, size: string) {
    e.preventDefault();
    filterState.clearChip(size);
  }

  function resetAll() {
    filterState.brand = '';
    filterState.type = '';
    filterState.lot = '';
    filterState.style = '';
    filterState.sizeType = '';
    filterState.resetChips();
  }

  async function onAddToList() {
    if (!entry) return;
    const entries: PickListEntry[] = [];
    for (const [typeKey, bucket] of Object.entries(filterState.chipCountsByType)) {
      const sizeMap = sizeMapFor(entry, typeKey);
      for (const [size, qty] of Object.entries(bucket)) {
        if (qty <= 0) continue;
        const stock = sizeMap[size] ?? 0;
        // Deterministic id — same lot/model/size/sizeType collapses on re-add.
        const id = `${entry.brand}||${entry.lot}||${entry.model}||${typeKey}||${size}`;
        entries.push({
          id,
          brand: entry.brand,
          model: entry.model,
          lot: entry.lot,
          category: entry.category,
          sizeType: typeKey,
          size,
          aisle: entry.aisle,
          flag: entry.flag,
          qty,
          stock,
          order: 0
        });
      }
    }
    if (!entries.length) return;
    try {
      await addToPickList(entries);
      const n = entries.reduce((s, e) => s + e.qty, 0);
      toastState.show(`Added ${n} to list`);
      filterState.resetChips();
    } catch (err) {
      console.error(err);
      toastState.show('Could not add — try again', 'error');
    }
  }

  function chipCount(size: string): number {
    const bucket = filterState.chipCountsByType[filterState.sizeType] ?? {};
    return bucket[size] ?? 0;
  }
</script>

<svelte:head><title>Find — Gruppo Bravo</title></svelte:head>

<main class="mx-auto w-full max-w-2xl px-5 pt-6 pb-28">
  <header class="mb-5 flex items-center justify-between">
    <h1 class="text-2xl font-bold tracking-tight text-ink">Find</h1>
    {#if filterState.brand || filterState.type || filterState.lot}
      <button
        type="button"
        class="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        onclick={resetAll}
      >
        Reset
      </button>
    {/if}
  </header>

  {#if !inventoryData.loaded && inventoryData.loading}
    <div class="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted shadow-sm">
      Loading inventory…
    </div>
  {:else if inventoryData.all.length === 0}
    <div class="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
      No inventory yet.
      <a class="text-accent hover:underline" href="{base}/import/">Import a file</a>
      to get started.
    </div>
  {:else}
    <!-- Brand chip row -->
    <section class="mb-4">
      <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Brand</div>
      <div class="-mx-1 flex flex-wrap gap-2 px-1">
        {#each brands as br (br)}
          {@const active = filterState.brand === br}
          <button
            type="button"
            class="rounded-full border px-4 py-1.5 text-sm font-medium transition active:scale-[0.97]"
            class:bg-accent={active}
            class:text-white={active}
            class:border-accent={active}
            class:bg-surface={!active}
            class:text-ink-soft={!active}
            class:border-border={!active}
            onclick={() => selectBrand(br)}
          >
            {br}
          </button>
        {/each}
      </div>
    </section>

    <!-- Type chip row (only when brand picked) -->
    {#if filterState.brand}
      <section class="mb-4">
        <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Type</div>
        {#if typesForBrand.length === 0}
          <div class="text-sm text-muted">No classified items for this brand yet.</div>
        {:else}
          <div class="-mx-1 flex flex-wrap gap-2 px-1">
            {#each typesForBrand as t (t)}
              {@const active = filterState.type === t}
              <button
                type="button"
                class="rounded-full border px-4 py-1.5 text-sm font-medium transition active:scale-[0.97]"
                class:bg-accent={active}
                class:text-white={active}
                class:border-accent={active}
                class:bg-surface={!active}
                class:text-ink-soft={!active}
                class:border-border={!active}
                onclick={() => selectType(t)}
              >
                {t}
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Lot + Style dropdowns -->
    {#if filterState.brand && filterState.type}
      <section class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Lot</span>
          <select
            class="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
            value={filterState.lot}
            onchange={onLotChange}
            disabled={lotsForBrandType.length === 0}
          >
            <option value="">{lotsForBrandType.length === 0 ? 'No lots' : 'Select lot'}</option>
            {#each lotsForBrandType as l (l)}
              <option value={l}>{truncateLot(l)}</option>
            {/each}
          </select>
        </label>

        <label class="block">
          <span class="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Style</span>
          <select
            class="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
            value={filterState.style}
            onchange={onStyleChange}
            disabled={!filterState.lot || stylesForLot.length === 0}
          >
            <option value="">
              {stylesForLot.length === 0 ? '—' : stylesForLot.length === 1 ? stylesForLot[0] : 'Select style'}
            </option>
            {#each stylesForLot as s (s)}
              <option value={s}>{s}</option>
            {/each}
          </select>
        </label>
      </section>
    {/if}

    <!-- Entry + info card + sizes -->
    {#if entry}
      <!-- Info card -->
      <section class="mb-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-ink">{entry.model}</div>
            <div class="truncate text-xs text-muted">
              {entry.brand} · {entry.category} · Lot {truncateLot(entry.lot)}
            </div>
          </div>
          {#if infoFlag}
            <span class="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent-ink">
              {infoFlag}
            </span>
          {/if}
        </div>
        <div class="mt-3 flex items-end gap-4 text-sm">
          <div class="min-w-0">
            <div class="text-[10px] uppercase tracking-wider text-muted">Aisle</div>
            <div class="font-mono text-ink">{entry.aisle ?? '—'}</div>
          </div>
          <div class="min-w-0">
            {#if entry.ttl != null}
              <div class="text-[10px] uppercase tracking-wider text-muted">In Stock</div>
              <div class="font-mono text-ink">{entry.ttl}</div>
            {:else if entry.shipdate}
              <div class="text-[10px] uppercase tracking-wider text-muted">Ship Date</div>
              <div class="font-mono text-ink">{entry.shipdate}</div>
            {/if}
          </div>
        </div>
      </section>

      <!-- Size type tabs -->
      {#if sizeTabs.length > 1}
        <div class="mb-3 flex gap-2">
          {#each sizeTabs as tab (tab.key)}
            {@const active = filterState.sizeType === tab.key}
            <button
              type="button"
              class="flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition"
              class:bg-ink={active}
              class:text-white={active}
              class:border-ink={active}
              class:bg-surface={!active}
              class:text-muted={!active}
              class:border-border={!active}
              onclick={() => pickSizeTab(tab.key)}
            >
              {tab.label}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Size chip grid -->
      {#if Object.keys(currentSizeMap).length === 0}
        <div class="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
          No sizes in this section.
        </div>
      {:else}
        <section class="space-y-2" role="list">
          {#each sizeRows as row, i (i)}
            <div class="flex gap-2">
              {#each row as size (size)}
                {@const stock = currentSizeMap[size] ?? 0}
                {@const count = chipCount(size)}
                {@const out = stock === 0}
                <button
                  type="button"
                  class="relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl border px-2 py-3 text-sm font-semibold transition select-none active:scale-[0.97]"
                  class:bg-accent-soft={count > 0}
                  class:border-accent={count > 0}
                  class:text-accent-ink={count > 0}
                  class:bg-surface={count === 0 && !out}
                  class:border-border={count === 0 && !out}
                  class:text-ink={count === 0 && !out}
                  class:bg-surface-2={out}
                  class:text-muted={out && count === 0}
                  disabled={out}
                  onpointerdown={() => onChipPressStart(size)}
                  onpointerup={() => onChipPressEnd(size, stock)}
                  onpointerleave={() => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }}
                  oncontextmenu={(e) => onChipContextMenu(e, size)}
                >
                  <span class="text-base">{size}</span>
                  <span class="text-[10px] font-medium text-muted" class:text-accent-ink={count > 0}>
                    {count > 0 ? `${count} / ${stock}` : out ? 'OUT' : `× ${stock}`}
                  </span>
                </button>
              {/each}
            </div>
          {/each}
        </section>
        <p class="mt-3 text-center text-[11px] text-muted">
          Tap to add · long-press (or right-click) to clear
        </p>
      {/if}
    {:else if filterState.brand && filterState.type && filterState.lot && stylesForLot.length > 1 && !filterState.style}
      <div class="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
        Select a style to see sizes.
      </div>
    {/if}
  {/if}
</main>

<!-- Sticky Add-to-Pick-List bar -->
{#if filterState.anySelected && entry}
  <div
    class="fixed inset-x-0 z-30 border-t border-border bg-surface/95 backdrop-blur"
    style="bottom: calc(60px + env(safe-area-inset-bottom));"
  >
    <div class="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
      <div class="min-w-0 text-sm">
        <div class="font-semibold text-ink">{filterState.totalSelected} selected</div>
        <div class="truncate text-xs text-muted">{entry.model}</div>
      </div>
      <button
        type="button"
        class="ml-auto shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.97] hover:bg-accent-hover"
        onclick={onAddToList}
      >
        Add to Pick List
      </button>
    </div>
  </div>
{/if}
