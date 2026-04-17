// Dexie schema — single IndexedDB database with five stores mirroring the
// original localStorage keys. Using IndexedDB means imports don't hit the
// ~5MB quota that localStorage imposes in some mobile browsers.

import Dexie, { type Table } from 'dexie';
import { classifyModel } from './parsers/classify';
import type {
  Category,
  ImportedFile,
  Item,
  PickListEntry,
  RawCategory,
  UnclassifiedItem
} from './types';

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
    // v1 shipped without `order` indexed on picklist — v2 adds it so
    // getPickList/addToPickList can use orderBy('order').
    this.version(1).stores({
      inventory: '&key, brand, category, lot, model, [brand+category]',
      unclassified: '&key, brand, model',
      memory: '&model',
      picklist: '&id',
      files: '++, name, importedAt'
    });
    this.version(2).stores({
      picklist: '&id, order'
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

export async function getUnclassified(): Promise<UnclassifiedItem[]> {
  const rows = await db.unclassified.toArray();
  return rows.map(({ key: _k, ...rest }) => rest as UnclassifiedItem);
}

/** Confirm `model → category`: writes memory, promotes every unclassified
 *  row for that model into inventory, and updates any inventory rows that
 *  had a different category. Returns how many rows moved/updated. */
export async function classifyAndPromoteModel(
  model: string,
  category: Category
): Promise<{ promoted: number; updated: number }> {
  let promoted = 0;
  let updated = 0;
  await db.transaction('rw', db.memory, db.unclassified, db.inventory, async () => {
    await db.memory.put({ model, category });

    const pending = await db.unclassified.where('model').equals(model).toArray();
    if (pending.length) {
      const fresh = pending.map(({ key: _k, ...rest }) => ({
        ...(rest as Omit<UnclassifiedItem, 'category'>),
        category,
        key: `${rest.brand}||${rest.lot}||${rest.model}`
      })) as unknown as (Item & { key: string })[];
      // bulkPut so any existing key in inventory is overwritten rather than throwing.
      await db.inventory.bulkPut(fresh);
      await db.unclassified.where('model').equals(model).delete();
      promoted = pending.length;
    }

    const inv = await db.inventory.where('model').equals(model).toArray();
    const stale = inv.filter((i) => i.category !== category);
    if (stale.length) {
      await db.inventory.bulkPut(stale.map((i) => ({ ...i, category })));
      updated = stale.length;
    }
  });
  return { promoted, updated };
}

/** Remove a memory override and re-run classification for `model` against
 *  DEFAULT_RULES. If the new answer is a real category, inventory rows keep
 *  up; if it comes back __UNCLASSIFIED__, they move back to the review queue. */
export async function forgetMemory(model: string): Promise<{ moved: number; newCategory: RawCategory }> {
  let moved = 0;
  let newCategory: RawCategory = '__UNCLASSIFIED__';
  await db.transaction('rw', db.memory, db.inventory, db.unclassified, async () => {
    await db.memory.delete(model);
    // Re-classify against default rules + remaining memory (minus this one).
    const remaining = await getMemoryInternal();
    newCategory = classifyModel(model, remaining);
    const affected = await db.inventory.where('model').equals(model).toArray();
    if (!affected.length) return;
    if (newCategory === '__UNCLASSIFIED__') {
      const keyed = affected.map((i) => {
        const { category: _c, key: _k, ...rest } = i;
        return {
          ...(rest as Omit<UnclassifiedItem, 'category'>),
          category: '__UNCLASSIFIED__' as const,
          key: `${i.brand}||${i.lot}||${i.model}`
        } as UnclassifiedItem & { key: string };
      });
      await db.unclassified.bulkPut(keyed);
      await db.inventory.where('model').equals(model).delete();
      moved = affected.length;
    } else if (newCategory !== '__SKIP__') {
      const cat = newCategory as Category;
      const changed = affected.filter((i) => i.category !== cat);
      if (changed.length) {
        await db.inventory.bulkPut(changed.map((i) => ({ ...i, category: cat })));
        moved = changed.length;
      }
    }
  });
  return { moved, newCategory };
}

/** Internal memory read — used inside transactions where we don't want to
 *  open a new outer transaction. */
async function getMemoryInternal(): Promise<Record<string, RawCategory>> {
  const rows = await db.memory.toArray();
  const out: Record<string, RawCategory> = {};
  for (const r of rows) out[r.model] = r.category;
  return out;
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

/** Upsert pick-list entries by id. If an entry with the same id exists, its
 *  qty is incremented by the new qty (so adding "40R x 2" twice yields 4);
 *  otherwise the entry is appended with the next `order` value. */
export async function addToPickList(entries: PickListEntry[]): Promise<number> {
  if (!entries.length) return db.picklist.count();
  await db.transaction('rw', db.picklist, async () => {
    const existingMax = (await db.picklist.orderBy('order').last())?.order ?? 0;
    let nextOrder = existingMax + 1;
    for (const e of entries) {
      const prev = await db.picklist.get(e.id);
      if (prev) {
        await db.picklist.put({ ...prev, qty: prev.qty + e.qty, stock: e.stock });
      } else {
        await db.picklist.put({ ...e, order: nextOrder++ });
      }
    }
  });
  return db.picklist.count();
}

export async function getPickList(): Promise<PickListEntry[]> {
  return db.picklist.orderBy('order').toArray();
}

export async function removeFromPickList(id: string): Promise<void> {
  await db.picklist.delete(id);
}

export async function clearPickList(): Promise<void> {
  await db.picklist.clear();
}

export async function updatePickListQty(id: string, qty: number): Promise<void> {
  if (qty <= 0) {
    await db.picklist.delete(id);
    return;
  }
  await db.picklist.update(id, { qty });
}

export async function counts(): Promise<{ inventory: number; unclassified: number; files: number }> {
  const [inventory, unclassified, files] = await Promise.all([
    db.inventory.count(),
    db.unclassified.count(),
    db.files.count()
  ]);
  return { inventory, unclassified, files };
}
