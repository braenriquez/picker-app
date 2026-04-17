// Reactive state for the Settings / classifications page. Exposes
// `reviewGroups` (unclassified items bucketed by model for single-click
// resolution) and `learned` (memory overrides that already exist).

import { browser } from '$app/environment';
import {
  classifyAndPromoteModel,
  forgetMemory,
  getMemory,
  getUnclassified,
  setMemory
} from '$lib/db';
import type { Category, RawCategory, UnclassifiedItem } from '$lib/types';

export interface ReviewGroup {
  model: string;
  items: UnclassifiedItem[];
}

export interface LearnedEntry {
  model: string;
  category: RawCategory;
}

class ClassificationsState {
  reviewGroups = $state<ReviewGroup[]>([]);
  learned = $state<LearnedEntry[]>([]);
  loading = $state(false);
  loaded = $state(false);

  async load() {
    if (!browser) return;
    this.loading = true;
    try {
      const [unclassified, memory] = await Promise.all([getUnclassified(), getMemory()]);
      this.reviewGroups = groupByModel(unclassified);
      this.learned = Object.entries(memory)
        .map(([model, category]) => ({ model, category }))
        .sort((a, b) => a.model.localeCompare(b.model));
      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }

  /** Commit a category for a model — writes memory, promotes matching
   *  unclassified items to inventory. */
  async resolve(model: string, category: Category) {
    const res = await classifyAndPromoteModel(model, category);
    await this.load();
    return res;
  }

  /** Change an existing memory entry to a different category (updates
   *  inventory rows for that model along the way). */
  async reassign(model: string, category: Category) {
    await classifyAndPromoteModel(model, category);
    await this.load();
  }

  /** Drop a memory override and re-classify against DEFAULT_RULES. Items
   *  may end up back in the review queue. */
  async forget(model: string) {
    const res = await forgetMemory(model);
    await this.load();
    return res;
  }

  /** Raw memory write — used for admin tasks; no inventory side-effects. */
  async setMemory(model: string, category: RawCategory) {
    await setMemory(model, category);
    await this.load();
  }

  get reviewCount(): number {
    let n = 0;
    for (const g of this.reviewGroups) n += g.items.length;
    return n;
  }
}

function groupByModel(items: UnclassifiedItem[]): ReviewGroup[] {
  const map = new Map<string, UnclassifiedItem[]>();
  for (const it of items) {
    const arr = map.get(it.model) ?? [];
    arr.push(it);
    map.set(it.model, arr);
  }
  return Array.from(map.entries())
    .map(([model, items]) => ({ model, items }))
    .sort((a, b) => a.model.localeCompare(b.model));
}

export const classificationsState = new ClassificationsState();
