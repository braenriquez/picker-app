<script lang="ts">
  import { onMount } from 'svelte';
  import { parseWorkbook, type ParseProgress } from '$lib/parsers/workbook';
  import { addItems, addUnclassified, recordFile, getMemory, clearAll } from '$lib/db';
  import { inventoryState } from '$lib/stores/inventory.svelte';

  let fileInput: HTMLInputElement;
  let progress = $state<ParseProgress | null>(null);
  let error = $state<string | null>(null);
  let lastResult = $state<{ name: string; added: number; unclassified: number; skipped: number } | null>(null);

  onMount(() => {
    inventoryState.refresh();
  });

  async function onFilesSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow selecting the same file again
    for (const file of files) {
      await importOne(file);
    }
  }

  async function importOne(file: File) {
    error = null;
    lastResult = null;
    try {
      const memory = await getMemory();
      const { items, unclassified } = await parseWorkbook(file, memory, (p) => {
        progress = p;
      });
      const addedItems = await addItems(items);
      const addedUnc = await addUnclassified(unclassified);
      await recordFile({
        name: file.name,
        itemCount: items.length,
        unclassCount: unclassified.length,
        importedAt: Date.now()
      });
      lastResult = {
        name: file.name,
        added: addedItems,
        unclassified: addedUnc,
        skipped: items.length - addedItems
      };
      await inventoryState.refresh();
    } catch (e) {
      console.error(e);
      error = e instanceof Error ? e.message : String(e);
    } finally {
      progress = null;
    }
  }

  async function onClearAll() {
    if (!confirm('Clear all inventory? Files will need to be re-imported.')) return;
    await clearAll();
    lastResult = null;
    await inventoryState.refresh();
  }

  function fmtDate(ts: number) {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  const progressPct = $derived(
    progress ? Math.round(100 * (progress.completed / Math.max(1, progress.total))) : 0
  );
</script>

<svelte:head>
  <title>Import — Gruppo Bravo</title>
</svelte:head>

<main class="mx-auto w-full max-w-2xl px-5 py-8">
  <header class="mb-8">
    <h1 class="text-2xl font-bold tracking-tight text-ink">Import</h1>
    <p class="mt-1 text-sm text-muted">
      Upload a Gruppo Bravo inventory <code class="rounded bg-surface-2 px-1 py-0.5 text-xs">.xlsx</code>
      file. Items are classified automatically; anything ambiguous lands in the review queue.
    </p>
  </header>

  <!-- Upload card -->
  <section class="mb-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
    <input
      bind:this={fileInput}
      type="file"
      accept=".xlsx,.xls"
      multiple
      class="hidden"
      onchange={onFilesSelected}
    />
    <button
      type="button"
      class="w-full rounded-xl border-2 border-dashed border-border-strong bg-surface-2 px-4 py-10 text-center transition hover:border-accent hover:bg-accent-soft/30"
      onclick={() => fileInput.click()}
      disabled={progress !== null}
    >
      <div class="text-3xl text-accent">↓</div>
      <div class="mt-2 font-medium text-ink">
        {progress ? 'Importing…' : 'Select XLSX file'}
      </div>
      <div class="mt-1 text-xs text-muted">Can select multiple at once</div>
    </button>

    {#if progress}
      <div class="mt-4">
        <div class="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>
            {progress.phase === 'reading' ? 'Reading file…' :
             progress.phase === 'parsing' ? `Parsing ${progress.current ?? ''}…` :
             progress.phase === 'classifying' ? 'Classifying…' :
             'Done'}
          </span>
          <span>{progress.completed} / {progress.total}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-surface-2">
          <div class="h-full bg-accent transition-all" style="width: {progressPct}%"></div>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="mt-4 rounded-lg border border-danger/30 bg-red-50 p-3 text-sm text-danger">
        {error}
      </div>
    {/if}

    {#if lastResult && !progress}
      <div class="mt-4 rounded-lg border border-accent/30 bg-accent-soft/40 p-3 text-sm">
        <div class="font-medium text-accent-ink">{lastResult.name}</div>
        <div class="mt-1 text-ink-soft">
          <span class="font-semibold text-ink">{lastResult.added}</span> new items
          {#if lastResult.skipped > 0}
            · <span class="text-muted">{lastResult.skipped} already on file</span>
          {/if}
          {#if lastResult.unclassified > 0}
            · <span class="font-semibold text-ink">{lastResult.unclassified}</span> need review
          {/if}
        </div>
      </div>
    {/if}
  </section>

  <!-- Status -->
  <section class="mb-6 grid grid-cols-3 gap-3 text-center">
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

  <!-- Import history -->
  {#if inventoryState.files.length > 0}
    <section class="mb-6 rounded-2xl border border-border bg-surface shadow-sm">
      <div class="border-b border-border px-5 py-3 text-sm font-semibold text-ink-soft">
        Import history
      </div>
      <ul>
        {#each inventoryState.files as f, i (i)}
          <li class="flex items-center justify-between border-b border-border px-5 py-3 last:border-b-0">
            <div class="min-w-0">
              <div class="truncate text-sm font-medium text-ink">{f.name}</div>
              <div class="text-xs text-muted">{fmtDate(f.importedAt)}</div>
            </div>
            <div class="ml-4 shrink-0 text-right text-xs text-muted">
              <div><span class="font-semibold text-ink-soft">{f.itemCount}</span> items</div>
              {#if f.unclassCount > 0}
                <div>{f.unclassCount} unclass.</div>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <!-- Danger zone -->
  {#if inventoryState.inventoryCount > 0}
    <section class="mb-4 text-center">
      <button
        type="button"
        class="text-sm text-danger underline-offset-4 hover:underline"
        onclick={onClearAll}
      >
        Clear all inventory
      </button>
    </section>
  {/if}
</main>
