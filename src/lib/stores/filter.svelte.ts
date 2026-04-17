// Filter state for the Find page, kept as a module-level singleton so the
// user's selections survive navigation away and back. Mirrors the `F` object
// in the original index.html (brand / type / lot / style / sizeType +
// per-size-type chip counts).

class FilterState {
  brand = $state('');
  type = $state('');
  lot = $state('');
  style = $state('');
  sizeType = $state('');
  /** `{ regular: { "40R": 2 }, short: { ... } }` — keyed by size-type key. */
  chipCountsByType = $state<Record<string, Record<string, number>>>({});

  resetSelection() {
    this.lot = '';
    this.style = '';
    this.sizeType = '';
    this.chipCountsByType = {};
  }

  resetChips() {
    this.chipCountsByType = {};
  }

  /** Tap adds one (up to stock). Returns the new count so the caller can
   *  reflect it without needing to re-read the store. */
  tapChip(size: string, stock: number): number {
    const key = this.sizeType;
    if (!key) return 0;
    const bucket = this.chipCountsByType[key] ?? {};
    const cur = bucket[size] ?? 0;
    if (stock > 0 && cur >= stock) return cur;
    bucket[size] = cur + 1;
    this.chipCountsByType = { ...this.chipCountsByType, [key]: { ...bucket } };
    return bucket[size];
  }

  clearChip(size: string) {
    const key = this.sizeType;
    if (!key) return;
    const bucket = { ...(this.chipCountsByType[key] ?? {}) };
    delete bucket[size];
    const next = { ...this.chipCountsByType, [key]: bucket };
    if (!Object.keys(bucket).length) delete next[key];
    this.chipCountsByType = next;
  }

  /** Any chip selected across any size type? Drives Add-to-List visibility. */
  get anySelected(): boolean {
    for (const m of Object.values(this.chipCountsByType)) {
      for (const v of Object.values(m)) {
        if (v > 0) return true;
      }
    }
    return false;
  }

  /** Total units across every selected chip. */
  get totalSelected(): number {
    let sum = 0;
    for (const m of Object.values(this.chipCountsByType)) {
      for (const v of Object.values(m)) sum += v;
    }
    return sum;
  }
}

export const filterState = new FilterState();
