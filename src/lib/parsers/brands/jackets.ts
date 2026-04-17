import type { ParsedItem, RawCategory } from '$lib/types';
import { classifyModel } from '../classify';
import { extractSizes, findTTLCol, isSkip, normalizeAisle, safeInt, type Row } from '../core';

/** JACKETS ALL BRANDS sheet — grouped by brand header rows, with some
 *  "swapped" special rows where lot/style are flipped and sized with letters. */
export function parseJacketsAllBrands(
  raw: Row[],
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const secR = (raw[4] ?? []) as Row;
  const letterHdr = (raw[5] ?? []) as Row;
  const hdr = (raw[7] ?? []) as Row;
  let shortS = 17, longS = 27, aisleC = 40;
  const shipC = 41;
  secR.forEach((v, i) => {
    const s = String(v ?? '').toUpperCase();
    if (s === 'SHORT' && i > 10) shortS = i;
    if (s === 'LONG' && i > 20) longS = i;
    if (s === 'AISLE' || s === '#') aisleC = i;
  });
  const ttlC = findTTLCol(hdr);
  const brandMap: Record<string, string> = {
    'MANTONI JACKETS:': 'Mantoni',
    'BERTOLINI JACKETS:': 'Bertolini',
    'ENZO JACKETS:': 'Enzo'
  };
  let currentBrand = 'Mantoni';
  const items: ParsedItem[] = [];
  for (let i = 8; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const lot = String(row[0] ?? '').trim();
    if (!lot) continue;
    if (brandMap[lot]) { currentBrand = brandMap[lot]; continue; }
    if (lot.endsWith(':')) continue;
    const flag = typeof row[1] === 'number' ? null : (String(row[1] ?? '').trim() || null);
    let model = String(row[2] ?? '').trim();
    if (isSkip(model)) continue;
    // Special rows: lot column has a color (no digits), style column has group name.
    // Swap so model becomes lot (findable in dropdown) and color becomes style.
    let lotFinal = lot;
    const swapped = !/\d/.test(lot) && !!model;
    if (swapped) { lotFinal = model; model = lot; }
    const classifyTarget = swapped ? lotFinal : model;
    let cat = classifyModel(classifyTarget, memory);
    if (cat === '__SKIP__') continue;
    if (cat === '__UNCLASSIFIED__') cat = /vest/i.test(classifyTarget) ? 'Vest' : 'Jacket';
    const reg = extractSizes(hdr, row, 3, shortS - 1);
    const short = extractSizes(hdr, row, shortS, longS - 1);
    const long_ = extractSizes(hdr, row, longS, aisleC - 2);
    if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
    const ttl = ttlC >= 0 ? (safeInt(row[ttlC]) || null) : null;
    if (swapped) {
      const sizes: Record<string, number> = {};
      for (let c = 0; c < letterHdr.length; c++) {
        const lbl = letterHdr[c];
        const val = row[c];
        if (lbl != null && String(lbl).trim() && val && typeof val === 'number' && val > 0) {
          const k = String(lbl).trim();
          sizes[k] = (sizes[k] ?? 0) + safeInt(val);
        }
      }
      if (!Object.keys(sizes).length) continue;
      items.push({
        lot: lotFinal, flag, model, brand: currentBrand, category: cat,
        aisle: normalizeAisle(row[aisleC]), shipdate: String(row[shipC] ?? ''), ttl,
        sizeSystem: 'vest_xs', sizes
      } as ParsedItem);
    } else {
      items.push({
        lot: lotFinal, flag, model, brand: currentBrand, category: cat,
        aisle: normalizeAisle(row[aisleC]), shipdate: String(row[shipC] ?? ''), ttl,
        sizeSystem: 'standard', regular: reg, short, long: long_
      } as ParsedItem);
    }
  }
  return items;
}
