import type { ParsedItem } from '$lib/types';
import { findTTLCol, isSkip, normalizeAisle, safeInt, type Row } from '../core';

export function parseJeans(raw: Row[]): ParsedItem[] {
  const hdr = (raw[3] ?? []) as Row;
  const aisleC = 17, shipC = 19;
  const ttlC = findTTLCol(hdr);
  const items: ParsedItem[] = [];
  for (let i = 4; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const lot = String(row[0] ?? '').trim();
    if (!lot || lot.startsWith('=')) continue;
    const styleVal = String(row[3] ?? '').trim();
    // Only apply isSkip when styleVal is non-empty (jeans rows routinely have col3=null)
    if ((styleVal && isSkip(styleVal)) || isSkip(lot)) continue;
    if (styleVal && styleVal.length > 3) continue; // skip notice rows
    const model = 'Jeans';
    const aisleRaw = normalizeAisle(row[aisleC]);
    const aisle = aisleRaw != null ? `Jeans - ${aisleRaw}` : null;
    const sizes: Record<string, number> = {};
    for (let c = 4; c <= 15; c++) {
      const sz = hdr[c];
      const val = row[c];
      if (sz != null && val && typeof val === 'number' && val > 0) sizes[String(sz)] = safeInt(val);
    }
    if (!Object.keys(sizes).length) continue;
    const ttl = ttlC >= 0 ? (safeInt(row[ttlC]) || null) : null;
    items.push({
      lot, flag: String(row[1] ?? '').trim() || null, model, brand: 'Enzo',
      category: 'Jeans', aisle, shipdate: String(row[shipC] ?? ''), ttl,
      sizeSystem: 'jeans', sizes
    });
  }
  return items;
}
