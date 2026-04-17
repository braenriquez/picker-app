// Dexie schema — single IndexedDB database with five stores mirroring the
// original localStorage keys. Using IndexedDB means imports don't hit the
// ~5MB quota that localStorage imposes in some mobile browsers.

import Dexie, { type Table } from 'dexie';
import type { ImportedFile, Item, PickListEntry, RawCategory, UnclassifiedItem } from './types';

/** Composite unique key used for dedupe on import. */
const itemKey = (i: { brand: string; lot: string; model: string }) =>
  `${i.brand}||${i.lot}||${i.model}`;

interface MemoryRow {
  model: string;
  category: RawCategory;
}

class GruppoBravoDB extends Dexie {
  // `&` on a column in the schema string = unique index. `++id` = auto pk.
  inventory!: Table<Item & { key: string }, string>;
  unclassified!: Table<UnclassifiedItem & { key: string }, string>;
  memory!: Table<MemoryRow, string>;
  picklist!: Table<PickListEntry, string>;
  files!: Table<ImportedFile, number>;

  constructor() {
    super('gruppo-bravo');
    this.version(1).stores({
      inventory: '&key, brand, category, lot, model, [brand+category]',
      unclassified: '&key, brand, model',
      memory: '&model',
      picklist: '&id',
      files: '++, name, importedAt'
    });
  }
}

export const db = new GruppoBravoDB();

// ── Convenience helpers ───────────────────────────────────────────────────

export async function getMemory(): Promise<Record<string, RawCategory>> {
  const rows = await db.memory.toArray();
  const out: Record<string, RawCategory> = {};
  for (const r of rows) out[r.model] = r.category;
  return out;
}

export async function setMemory(model: string, category: RawCategory): Promise<void> {
  await db.memory.put({ model, category });
}

export async function removeMemory(model: string): Promise<void> {
  await db.memory.delete(model);
}

/** Upsert items into inventory, keyed by brand||lot||model (no duplicates). */
export async function addItems(items: Item[]): Promise<number> {
  const keyed = items.map((i) => ({ ...i, key: itemKey(i) }));
  const existing = new Set(
    await db.inventory.where('key').anyOf(keyed.map((k) => k.key)).primaryKeys()
  );
  const fresh = keyed.filter((k) => !existing.has(k.key));
  if (fresh.length) await db.inventory.bulkAdd(fresh);
  return fresh.length;
}

export async function addUnclassified(items: UnclassifiedItem[]): Promise<number> {
  const keyed = items.map((i) => ({ ...i, key: itemKey(i) }));
  const existing = new Set(
    await db.unclassified.where('key').anyOf(keyed.map((k) => k.key)).primaryKeys()
  );
  const fresh = keyed.filter((k) => !existing.has(k.key));
  if (fresh.length) await db.unclassified.bulkAdd(fresh);
  return fresh.length;
}

export async function recordFile(entry: ImportedFile): Promise<void> {
  await db.files.add(entry);
}

export async function getFiles(): Promise<ImportedFile[]> {
  return db.files.orderBy('importedAt').reverse().toArray();
}

export async function clearAll(): Promise<void> {
  await Promise.all([
    db.inventory.clear(),
    db.unclassified.clear(),
    db.files.clear()
  ]);
  // Keep memory and picklist — user corrections and active pick shouldn't
  // vanish when they re-import to replace source data.
}

export async function counts(): Promise<{ inventory: number; unclassified: number; files: number }> {
  const [inventory, unclassified, files] = await Promise.all([
    db.inventory.count(),
    db.unclassified.count(),
    db.files.count()
  ]);
  return { inventory, unclassified, files };
}
