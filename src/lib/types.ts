// Core domain types shared across parsers, DB, and UI.
// The original index.html used plain objects; these types pin down the
// shape so every consumer (parser, store, page) sees the same model.

export const CATEGORIES = ['Suit', 'Jacket', 'Vest', 'Pants', 'Shirt', 'Jeans', 'Boys'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Sentinels used during parse/classification. Not user-facing. */
export type ClassifySentinel = '__SKIP__' | '__UNCLASSIFIED__';
export type RawCategory = Category | ClassifySentinel;

export type SizeSystem =
  | 'standard'       // Regular / Short / Long numeric (38/40R, 40S, 40L, etc.)
  | 'vest_xs'        // Letter sizes XS…XL (rental vests, special jackets)
  | 'boys_numeric'   // Numeric boys suit sizes (e.g. 8,10,12,14,16,18,20)
  | 'boys_bxs'       // Boys letter sizes (BXS, BS, BM, BL, BXL)
  | 'boys_pants'     // Rental boys pants
  | 'boys_tpants'    // Traditional boys pants numeric
  | 'shirt'          // Sleeve-range × neck-size composite keys
  | 'jeans';         // Flat numeric waist sizes

export interface ItemBase {
  lot: string;
  flag: string | null;
  model: string;
  brand: string;
  category: Category;
  aisle: number | string | null;
  shipdate: string;
  ttl: number | null;
  sizeSystem: SizeSystem;
  /** Optional secondary label per size (e.g. chest range for vest/shirt). */
  sizeMeta?: Record<string, string>;
}

/** Items split across Regular / Short / Long tabs. */
export interface StandardItem extends ItemBase {
  sizeSystem: 'standard';
  regular: Record<string, number>;
  short: Record<string, number>;
  long: Record<string, number>;
}

/** Items with a single flat size map (vests, boys, shirts, jeans). */
export interface FlatItem extends ItemBase {
  sizeSystem: Exclude<SizeSystem, 'standard'>;
  sizes: Record<string, number>;
}

export type Item = StandardItem | FlatItem;

/** Unclassified items look like Item but with category unknown. Kept as a
 *  separate type so the review queue flow is explicit. */
export type UnclassifiedItem = Omit<Item, 'category'> & {
  category: '__UNCLASSIFIED__';
};

/** Raw output from a parser — category may still be a sentinel until the
 *  workbook dispatcher splits into inventory vs. unclassified. Keeps the
 *  discriminated union on sizeSystem so narrowing by `{ sizeSystem: 'standard' }`
 *  works downstream. */
export type ParsedItem =
  | (Omit<StandardItem, 'category'> & { category: RawCategory })
  | (Omit<FlatItem, 'category'> & { category: RawCategory });

export interface ImportedFile {
  name: string;
  itemCount: number;
  unclassCount: number;
  importedAt: number; // epoch ms
}

/** One pick-list row. `size` is the raw label ("40", "M", "15.5/32-33") and
 *  `sizeType` carries Regular/Short/Long (or "sizes" for flat systems) so the
 *  pick-list UI can render Type and Size in separate columns. `aisle` is
 *  snapshotted at add-time for the aisle-grouped print layout. */
export interface PickListEntry {
  id: string;
  brand: string;
  model: string;
  lot: string;
  category: Category;
  sizeType: string;
  size: string;
  aisle: number | string | null;
  flag: string | null;
  qty: number;
  stock: number;
  order: number;
}

export interface ClassifyRule {
  p: string; // regex source
  c: RawCategory;
}
