import type { Item } from './types';

/** The set of size-type tabs available for an item. Standard suits may have
 *  Regular / Short / Long (only non-empty ones shown); every other size
 *  system collapses to a single "sizes" tab. */
export function sizeTypesForEntry(entry: Item): { key: string; label: string }[] {
  if (entry.sizeSystem === 'standard') {
    const tabs: { key: string; label: string }[] = [];
    if (Object.keys(entry.regular).length) tabs.push({ key: 'regular', label: 'Regular' });
    if (Object.keys(entry.short).length) tabs.push({ key: 'short', label: 'Short' });
    if (Object.keys(entry.long).length) tabs.push({ key: 'long', label: 'Long' });
    return tabs;
  }
  return [{ key: 'sizes', label: 'All Sizes' }];
}

/** Resolve a tab key back to the actual size map on an item. */
export function sizeMapFor(entry: Item, key: string): Record<string, number> {
  if (entry.sizeSystem === 'standard') {
    if (key === 'regular') return entry.regular;
    if (key === 'short') return entry.short;
    if (key === 'long') return entry.long;
    return {};
  }
  return entry.sizes;
}

/** Colors/fabrics tagged as "C", "None", or plain numbers are not useful —
 *  strip them so the info card only surfaces meaningful descriptors. */
export function meaningfulFlag(flag: string | null): string | null {
  if (!flag) return null;
  const t = flag.trim();
  if (!t) return null;
  const up = t.toUpperCase();
  if (up === 'C' || up === 'NONE') return null;
  if (!isNaN(parseFloat(t)) && String(parseFloat(t)) === t) return null;
  return t;
}

/** Partition an array into rows of up to 3 items each, balanced so row sizes
 *  differ by at most 1 (N=4→[2,2], N=5→[3,2], N=7→[3,2,2]). Drives the
 *  "equal-width chips filling each line" layout the user spec'd. */
export function balancedRows<T>(items: T[]): T[][] {
  const n = items.length;
  if (n === 0) return [];
  if (n <= 3) return [items];
  const rows = Math.ceil(n / 3);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  const out: T[][] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const size = base + (r < extra ? 1 : 0);
    out.push(items.slice(idx, idx + size));
    idx += size;
  }
  return out;
}

/** Strip parenthetical descriptors from a lot for display ("123 (Black)" → "123").
 *  The raw value is still used as the dropdown option value so lookups work. */
export function truncateLot(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}
