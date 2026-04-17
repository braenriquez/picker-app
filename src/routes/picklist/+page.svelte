<script lang="ts">
  // Pick List page: grouped view of queued items for pulling from the
  // warehouse. Primary group is aisle, secondary is lot+model. Each row is
  // a single size entry that can be incremented / decremented / removed.
  // Print action opens the native print dialog — a dedicated @media print
  // block in app.css strips chrome so the printout reads as a clean slip.
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { picklistState } from '$lib/stores/picklist.svelte';
  import { toastState } from '$lib/stores/toast.svelte';
  import { aisleSortKey } from '$lib/parsers/core';
  import { meaningfulFlag, truncateLot } from '$lib/find-helpers';
  import type { PickListEntry } from '$lib/types';

  onMount(() => {
    if (!picklistState.loaded) picklistState.load();
  });

  // ── Grouping ──────────────────────────────────────────────────────────────
  //
  // Original layout: aisle header → (lot + model) sub-header → one row per
  // size. Within each leaf, rows sort by sizeType (regular → short → long →
  // other) then by size comparator (numeric first, then letter rank).

  type LotGroup = { lot: string; model: string; flag: string | null; rows: PickListEntry[] };
  type AisleGroup = { aisle: number | string | null; lots: LotGroup[] };

  const groups = $derived.by<AisleGroup[]>(() => {
    const byAisle = new Map<string, { aisle: number | string | null; lots: Map<string, LotGroup> }>();
    for (const e of picklistState.entries) {
      const aisleKey = e.aisle == null ? '__NULL__' : String(e.aisle);
      let a = byAisle.get(aisleKey);
      if (!a) {
        a = { aisle: e.aisle ?? null, lots: new Map() };
        byAisle.set(aisleKey, a);
      }
      const lotKey = `${e.lot}||${e.model}`;
      let lg = a.lots.get(lotKey);
      if (!lg) {
        lg = { lot: e.lot, model: e.model, flag: meaningfulFlag(e.flag), rows: [] };
        a.lots.set(lotKey, lg);
      }
      lg.rows.push(e);
    }

    const aisles = Array.from(byAisle.values()).map((a) => ({
      aisle: a.aisle,
      lots: Array.from(a.lots.values())
        .map((lg) => ({
          ...lg,
          rows: [...lg.rows].sort(compareRows)
        }))
        .sort((x, y) => x.lot.localeCompare(y.lot) || x.model.localeCompare(y.model))
    }));

    aisles.sort((x, y) => {
      const a = aisleSortKey(x.aisle);
      const b = aisleSortKey(y.aisle);
      return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
    });
    return aisles;
  });

  const aisleCount = $derived(groups.length);
  const itemCount = $derived(picklistState.entries.length);
  const totalQty = $derived(picklistState.totalQty);

  const SIZE_TYPE_RANK: Record<string, number> = {
    regular: 0, short: 1, long: 2, sizes: 3
  };

  function compareRows(a: PickListEntry, b: PickListEntry): number {
    const ra = SIZE_TYPE_RANK[a.sizeType] ?? 9;
    const rb = SIZE_TYPE_RANK[b.sizeType] ?? 9;
    if (ra !== rb) return ra - rb;
    const na = parseFloat(a.size);
    const nb = parseFloat(b.size);
    if (!isNaN(na) && !isNaN(nb) && String(na) === a.size && String(nb) === b.size) return na - nb;
    return a.size.localeCompare(b.size);
  }

  function sizeTypeLabel(k: string): string {
    if (k === 'regular') return 'R';
    if (k === 'short') return 'S';
    if (k === 'long') return 'L';
    return '—';
  }

  function aisleLabel(a: number | string | null): string {
    if (a == null) return 'Unmarked';
    return typeof a === 'number' ? `Aisle ${a}` : /^aisle/i.test(String(a)) ? String(a) : `Aisle ${a}`;
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  async function bumpQty(id: string, delta: number) {
    const entry = picklistState.entries.find((e) => e.id === id);
    if (!entry) return;
    const next = entry.qty + delta;
    if (next <= 0) {
      await picklistState.remove(id);
      toastState.show('Removed');
      return;
    }
    if (entry.stock > 0 && next > entry.stock) {
      toastState.show(`Only ${entry.stock} in stock`, 'error');
      return;
    }
    await picklistState.setQty(id, next);
  }

  async function removeRow(id: string) {
    await picklistState.remove(id);
    toastState.show('Removed');
  }

  async function onClearAll() {
    if (!confirm('Clear the entire pick list?')) return;
    await picklistState.clear();
    toastState.show('Cleared');
  }

  function onPrint() {
    if (typeof window !== 'undefined') window.print();
  }
</script>

<svelte:head><title>Pick List — Gruppo Bravo</title></svelte:head>

<main class="pl-root mx-auto w-full max-w-2xl px-5 pt-6 pb-10">
  <header class="mb-4 flex items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-ink">Pick List</h1>
      {#if itemCount > 0}
        <p class="mt-0.5 text-xs text-muted">
          {itemCount} {itemCount === 1 ? 'item' : 'items'} · {totalQty} units · {aisleCount}
          {aisleCount === 1 ? 'aisle' : 'aisles'}
        </p>
      {/if}
    </div>
    {#if itemCount > 0}
      <div class="no-print flex items-center gap-2">
        <button
          type="button"
          class="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink"
          onclick={onPrint}
        >
          Print
        </button>
        <button
          type="button"
          class="rounded-full border border-danger/30 bg-surface px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-red-50"
          onclick={onClearAll}
        >
          Clear
        </button>
      </div>
    {/if}
  </header>

  {#if !picklistState.loaded && picklistState.loading}
    <div class="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted shadow-sm">
      Loading…
    </div>
  {:else if itemCount === 0}
    <div class="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted shadow-sm">
      <div class="mb-2 text-3xl text-accent">✓</div>
      <div class="text-ink">Nothing queued yet.</div>
      <div class="mt-1">
        Head to the <a class="text-accent hover:underline" href="{base}/find/">Find</a> tab to add items.
      </div>
    </div>
  {:else}
    <!-- Column header row (sticky-ish on scroll, replicated per aisle for clarity) -->
    <div class="space-y-5">
      {#each groups as ag (String(ag.aisle))}
        {@const aisleTotal = ag.lots.reduce((s, l) => s + l.rows.reduce((t, r) => t + r.qty, 0), 0)}
        <section class="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <!-- Aisle header -->
          <div class="flex items-baseline justify-between border-b border-border bg-surface-2 px-4 py-2">
            <div class="text-sm font-semibold uppercase tracking-wider text-ink-soft">
              {aisleLabel(ag.aisle)}
            </div>
            <div class="text-[11px] text-muted">
              {aisleTotal} {aisleTotal === 1 ? 'unit' : 'units'}
            </div>
          </div>

          {#each ag.lots as lg, li (lg.lot + '||' + lg.model)}
            <div class:border-t={li > 0} class:border-border={li > 0}>
              <!-- Lot+Model sub-header -->
              <div class="flex items-baseline gap-2 px-4 pt-3 pb-1.5">
                {#if lg.flag}
                  <span class="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-ink">
                    {lg.flag}
                  </span>
                {/if}
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-semibold text-ink">{lg.model}</div>
                  <div class="truncate text-[11px] text-muted">Lot {truncateLot(lg.lot)}</div>
                </div>
              </div>

              <!-- Rows -->
              <ul class="pb-2">
                {#each lg.rows as row (row.id)}
                  <li class="grid grid-cols-[48px_28px_42px_1fr_auto_auto] items-center gap-2 px-4 py-1.5 text-sm">
                    <!-- Ordered qty -->
                    <div class="flex items-center justify-center rounded-lg bg-accent-soft px-1.5 py-1 font-bold tabular-nums text-accent-ink">
                      {row.qty}
                    </div>
                    <!-- Type (R/S/L/—) -->
                    <div class="text-center font-mono text-xs text-muted">
                      {sizeTypeLabel(row.sizeType)}
                    </div>
                    <!-- Size -->
                    <div class="font-semibold tabular-nums text-ink">
                      {row.size}
                    </div>
                    <!-- Spacer -->
                    <div></div>
                    <!-- In stock -->
                    <div class="text-right text-[11px] tabular-nums text-muted">
                      / {row.stock}
                    </div>
                    <!-- Actions -->
                    <div class="no-print flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Decrease qty"
                        class="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-soft transition hover:border-ink hover:text-ink active:scale-95"
                        onclick={() => bumpQty(row.id, -1)}
                      >−</button>
                      <button
                        type="button"
                        aria-label="Increase qty"
                        class="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-soft transition hover:border-ink hover:text-ink active:scale-95"
                        onclick={() => bumpQty(row.id, 1)}
                      >+</button>
                      <button
                        type="button"
                        aria-label="Remove"
                        class="flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-red-50 hover:text-danger active:scale-95"
                        onclick={() => removeRow(row.id)}
                      >×</button>
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </section>
      {/each}
    </div>
  {/if}
</main>
