import type { ParsedItem, RawCategory } from '$lib/types';
import { classifyModel, getSizeSystem } from './classify';
import { extractSizes, findTTLCol, isSkip, normalizeAisle, safeInt, type Row } from './core';

export interface BuildStandardOpts {
  raw: Row[];
  startRow: number;
  hdr: Row;
  shortS: number;
  longS: number;
  aisleC: number;
  shipC: number;
  brand: string;
  priceInCol1?: boolean;
  vestSubHdr?: Row | null;
  vestChestHdr?: Row | null;
  memory: Record<string, RawCategory>;
}

/** Shared "Suit-shaped" parser: Regular/Short/Long columns, with optional
 *  vest letter-size section that overlays the Regular columns. Used by
 *  Bertolini, Enzo, Vincenzi, Carlo Lusso. */
export function buildStandardSuits(opts: BuildStandardOpts): ParsedItem[] {
  const { raw, startRow, hdr, shortS, longS, aisleC, shipC, brand, priceInCol1, vestSubHdr, vestChestHdr, memory } = opts;
  const ttlC = findTTLCol(hdr);
  const items: ParsedItem[] = [];
  for (let i = startRow; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const lot = String(row[0] ?? '').trim();
    if (!lot || lot.startsWith('=')) continue;
    const flag = priceInCol1 ? null : (String(row[1] ?? '').trim() || null);
    const model = String(row[2] ?? '').trim();
    if (isSkip(model)) continue;
    let cat = classifyModel(model, memory);
    if (cat === '__SKIP__') continue;
    if (cat === '__UNCLASSIFIED__' && /vest/i.test(model)) cat = 'Vest';
    const sys = getSizeSystem(model);
    const ttl = ttlC >= 0 ? (safeInt(row[ttlC]) || null) : null;
    const base = {
      lot,
      flag: flag === 'None' ? null : flag,
      model,
      brand,
      category: cat,
      aisle: normalizeAisle(row[aisleC]),
      shipdate: String(row[shipC] ?? ''),
      ttl,
      sizeSystem: sys
    } as const;

    // Letter-sized vests (e.g. Roland-Vest) — sizes come from vestSubHdr cols,
    // with chest-range sub-labels from vestChestHdr for 2-line chip display.
    if (sys === 'vest_xs' && vestSubHdr) {
      const sz: Record<string, number> = {};
      const meta: Record<string, string> = {};
      for (let c = 0; c < vestSubHdr.length; c++) {
        const lbl = vestSubHdr[c];
        const val = row[c];
        if (lbl != null && String(lbl).trim() && val && typeof val === 'number' && val > 0) {
          const k = String(lbl).trim();
          sz[k] = safeInt(val);
          if (vestChestHdr && vestChestHdr[c] != null && String(vestChestHdr[c]).trim()) {
            meta[k] = String(vestChestHdr[c]).trim();
          }
        }
      }
      if (!Object.keys(sz).length) continue;
      const item: ParsedItem = { ...base, sizeSystem: 'vest_xs', sizes: sz };
      if (Object.keys(meta).length) item.sizeMeta = meta;
      items.push(item);
      continue;
    }

    const reg = extractSizes(hdr, row, 3, shortS - 1);
    const short = extractSizes(hdr, row, shortS, longS - 1);
    const long_ = extractSizes(hdr, row, longS, aisleC - 2);
    if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
    items.push({ ...base, sizeSystem: 'standard', regular: reg, short, long: long_ } as ParsedItem);
  }
  return items;
}
