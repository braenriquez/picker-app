import type { ParsedItem } from '$lib/types';
import { findTTLCol, isSkip, normalizeAisle, safeInt, type Row } from '../core';

/** ALL DRESS SHIRTS sheet — composite size keys of `sleeveRange/neckSize`.
 *  Sections can be brand-titled or "spec" (linen / adjustable convertible)
 *  where letter sizes live in the section header row itself and chest
 *  ranges in the next row. Some spec sub-headers are untitled and must be
 *  detected heuristically. */
export function parseShirts(raw: Row[]): ParsedItem[] {
  const neckHdr = (raw[7] ?? []) as Row;
  const aisleC = 38, shipC = 39;
  const ttlC = findTTLCol(neckHdr);
  const sleeveSec = (raw[4] ?? []) as Row;
  const sleeveLabels: Record<number, string> = {};
  // Collect sleeve labels in order; normalize "32 / 33" → "32-33"
  const slvLbls: string[] = [];
  for (let c = 3; c <= 37; c++) {
    const v = sleeveSec[c];
    if (v != null && String(v).trim()) {
      slvLbls.push(String(v).trim().replace(/\s/g, '').replace(/\//g, '-'));
    }
  }
  // Detect group boundaries: where neck values reset (decrease)
  const groupStarts: number[] = [3];
  let prevN = -1;
  for (let c = 4; c <= 36; c++) {
    const v = neckHdr[c];
    if (v == null) continue;
    const n = parseFloat(String(v));
    if (!isNaN(n) && n <= 30 && prevN > 0 && n < prevN) groupStarts.push(c);
    if (!isNaN(n) && n <= 30) prevN = n;
  }
  for (let g = 0; g < groupStarts.length; g++) {
    const s = groupStarts[g];
    const e = g + 1 < groupStarts.length ? groupStarts[g + 1] - 1 : 36;
    const lbl = slvLbls[g] || `sleeve${g}`;
    for (let c = s; c <= e; c++) sleeveLabels[c] = lbl;
  }
  const brandMap: Record<string, string> = {
    'ENZO DRESS SHIRTS:': 'Enzo',
    'MANTONI 100% COTTON DRESS SHIRTS:': 'Mantoni',
    'LINEN SHIRTS': 'Mantoni',
    'GIORGIO FIORELLI DRESS SHIRTS:': 'Giorgio Fiorelli',
    'ADJUSTABLE CONVERTIBLE SHIRTS': 'Giorgio Fiorelli'
  };
  const LETTER_TOKEN = /^(?:S|M|L|XL|XXL|2XL|3XL|4XL|5XL|S3|M3|L3|XL3|M5|L5|XL5|2XL5|3XL5|4XL5|L7|XL7|2XL7|3XL7|4XL7)$/i;
  function isLetterSubHdr(row: Row): boolean {
    if (!row || String(row[0] ?? '').trim()) return false;
    for (let c = 3; c <= 20; c++) {
      const v = row[c];
      if (v != null && LETTER_TOKEN.test(String(v).trim())) return true;
    }
    return false;
  }
  let currentBrand = 'Enzo';
  let currentHdr: Row = neckHdr;
  let currentMeta: Row | null = null;
  let isSpec = false;
  const items: ParsedItem[] = [];
  for (let i = 8; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const lot = String(row[0] ?? '').trim();
    // Titled section header
    if (lot && brandMap[lot]) {
      currentBrand = brandMap[lot];
      const spec = lot === 'LINEN SHIRTS' || lot === 'ADJUSTABLE CONVERTIBLE SHIRTS';
      if (spec) {
        currentHdr = row;
        currentMeta = raw[i + 1] ?? [];
        isSpec = true;
        i += 1; // skip chest-range row
      } else {
        currentHdr = neckHdr;
        currentMeta = null;
        isSpec = false;
      }
      continue;
    }
    // Untitled letter sub-header (col 0 null + letter tokens at col 14+)
    if (!lot && isLetterSubHdr(row)) {
      currentHdr = row;
      currentMeta = raw[i + 1] ?? [];
      isSpec = true;
      i += 1;
      continue;
    }
    if (!lot) continue;
    if (lot.endsWith(':')) continue;
    const flag = String(row[1] ?? '').trim() || null;
    const model = String(row[2] ?? '').trim();
    if (isSkip(model)) continue;
    const aisle = normalizeAisle(row[aisleC]);
    const sizes: Record<string, number> = {};
    const sizeMeta: Record<string, string> = {};
    for (let c = 3; c <= 35; c++) {
      const hdrVal = currentHdr[c];
      if (hdrVal == null || String(hdrVal).trim() === '') continue;
      const val = row[c];
      if (val && typeof val === 'number' && val > 0) {
        const sleeve = sleeveLabels[c] || 'Other';
        const tag = String(hdrVal).trim();
        const lbl = `${sleeve}/${tag}`;
        sizes[lbl] = (sizes[lbl] ?? 0) + safeInt(val);
        if (isSpec && currentMeta) {
          const chest = currentMeta[c];
          if (chest != null && String(chest).trim() !== '') sizeMeta[lbl] = String(chest).trim();
        }
      }
    }
    if (!Object.keys(sizes).length) continue;
    const ttl = ttlC >= 0 ? (safeInt(row[ttlC]) || null) : null;
    const item: ParsedItem = {
      lot, flag: flag === 'None' ? null : flag, model, brand: currentBrand,
      category: 'Shirt', aisle, shipdate: String(row[shipC] ?? ''), ttl,
      sizeSystem: 'shirt', sizes
    };
    if (Object.keys(sizeMeta).length) item.sizeMeta = sizeMeta;
    items.push(item);
  }
  return items;
}
