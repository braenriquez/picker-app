// Reactive pick-list state. Pages read `picklistState.entries` and call
// `load()` on mount / after mutations. Mutations go through the exposed
// helpers so the store always mirrors Dexie without requiring a full reload.

import { browser } from '$app/environment';
import {
  clearPickList,
  getPickList,
  removeFromPickList,
  updatePickListQty
} from '$lib/db';
import type { PickListEntry } from '$lib/types';

class PickListState {
  entries = $state<PickListEntry[]>([]);
  loading = $state(false);
  loaded = $state(false);

  async load() {
    if (!browser) return;
    this.loading = true;
    try {
      this.entries = await getPickList();
      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }

  async remove(id: string) {
    await removeFromPickList(id);
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  async clear() {
    await clearPickList();
    this.entries = [];
  }

  async setQty(id: string, qty: number) {
    await updatePickListQty(id, qty);
    if (qty <= 0) {
      this.entries = this.entries.filter((e) => e.id !== id);
    } else {
      this.entries = this.entries.map((e) => (e.id === id ? { ...e, qty } : e));
    }
  }

  get totalQty(): number {
    let s = 0;
    for (const e of this.entries) s += e.qty;
    return s;
  }
}

export const picklistState = new PickListState();
