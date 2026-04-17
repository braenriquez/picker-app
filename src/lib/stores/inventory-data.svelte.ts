// Reactive cache of every inventory row. Loaded once from Dexie on mount,
// refreshed after imports / clears. 1k-10k items is small enough that
// in-memory filtering is simpler and faster than round-tripping IndexedDB
// on every keystroke.

import { browser } from '$app/environment';
import { db } from '$lib/db';
import type { Item } from '$lib/types';

class InventoryData {
  all = $state<Item[]>([]);
  loading = $state(false);
  loaded = $state(false);

  async load() {
    if (!browser) return;
    this.loading = true;
    try {
      const rows = await db.inventory.toArray();
      // Strip the dexie-only composite key before exposing to pages.
      this.all = rows.map(({ key: _key, ...rest }) => rest as Item);
      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }
}

export const inventoryData = new InventoryData();
