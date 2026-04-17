// Reactive inventory summary state using Svelte 5 runes.
// Pages import this and read fields directly; the store is a singleton
// proxy backed by Dexie that re-queries on demand.

import { browser } from '$app/environment';
import { counts, getFiles } from '$lib/db';
import type { ImportedFile } from '$lib/types';

class InventoryState {
  inventoryCount = $state(0);
  unclassifiedCount = $state(0);
  fileCount = $state(0);
  files = $state<ImportedFile[]>([]);
  loading = $state(false);

  async refresh() {
    if (!browser) return;
    this.loading = true;
    try {
      const [c, f] = await Promise.all([counts(), getFiles()]);
      this.inventoryCount = c.inventory;
      this.unclassifiedCount = c.unclassified;
      this.fileCount = c.files;
      this.files = f;
    } finally {
      this.loading = false;
    }
  }
}

export const inventoryState = new InventoryState();
