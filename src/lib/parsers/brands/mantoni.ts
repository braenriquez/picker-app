import type { ParsedItem, RawCategory } from '$lib/types';
import { classifyModel, getSizeSystem } from '../classify';
import { extractSizes, findTTLCol, isSkip, normalizeAisle, safeInt, type Row } from '../core';

export function parseMantoniSuits(
  raw: Row[],
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const secR = (raw[4] ?? []) as Row;
  const shortSubHdr = (raw[5] ?? []) as Row;
  const hdr = (raw[6] ?? []) as Row;
  let shortS = 19, longS = 35, aisleC = 50;
  const shipC = 52;
  secR.forEach((v, i) => {
    const s = String(v ?? '').toUpperCase();
    if (s === 'SHORT' && i > 10) shortS = i;
    if (s === 'LONG' && i > 20) longS = i;
    if (s === 'AISLE' || s === '#') aisleC = i;
  });
  const ttlC = findTTLCol(hdr);
  const items: ParsedItem[] = [];
  for (let i = 7; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const lot = String(row[0] ?? '').trim();
    if (!lot || lot.startsWith('=')) continue;
    const flag = String(row[1] ?? '').trim() || null;
    const model = String(row[2] ?? '').trim();
    if (isSkip(model)) continue;
    const cat = classifyModel(model, memory);
    if (cat === '__SKIP__') continue;
    const sys = getSizeSystem(model);
    const aisle = normalizeAisle(row[aisleC]);
    const ttl = ttlC >= 0 ? (safeInt(row[ttlC]) || null) : null;
    const base = {
      lot,
      flag: flag === 'None' ? null : flag,
      model,
      brand: 'Mantoni',
      category: cat,
      aisle,
      shipdate: String(row[shipC] ?? ''),
      ttl,
      sizeSystem: sys
    } as const;

    if (sys === 'vest_xs' || sys === 'boys_bxs' || sys === 'boys_numeric') {
      const sz: Record<string, number> = {};
      for (let c = shortS; c < longS; c++) {
        const lbl = shortSubHdr[c];
        const val = row[c];
        if (lbl && val && typeof val === 'number' && val > 0) sz[String(lbl)] = safeInt(val);
      }
      if (!Object.keys(sz).length) continue;
      items.push({ ...base, sizes: sz } as ParsedItem);
    } else {
      const reg = extractSizes(hdr, row, 3, shortS - 1);
      const short = extractSizes(hdr, row, shortS, longS - 1);
      const long_ = extractSizes(hdr, row, longS, aisleC - 2);
      if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
      items.push({ ...base, sizeSystem: 'standard', regular: reg, short, long: long_ } as ParsedItem);
    }
  }
  return items;
}

export function parseMantoniPants(
  raw: Row[],
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const boysHdr = (raw[3] ?? []) as Row;
  const hdr = (raw[4] ?? []) as Row;
  const aisleC = 20, shipC = 22;
  const ttlC = findTTLCol(hdr);
  const items: ParsedItem[] = [];
  for (let i = 5; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const lot = String(row[0] ?? '').trim();
    if (!lot || /ENZO PANTS|MANTONI/i.test(lot)) continue;
    const flag = String(row[1] ?? '').trim() || null;
    const model = String(row[2] ?? '').trim();
    if (isSkip(model)) continue;
    const cat = classifyModel(model, memory);
    if (cat === '__SKIP__') continue;
    const brand = lot.toUpperCase().startsWith('E') ? 'Enzo' : 'Mantoni';
    const aisle = normalizeAisle(row[aisleC]);
    const ttl = ttlC >= 0 ? (safeInt(row[ttlC]) || null) : null;
    if (/^BOYS-Pants/i.test(model)) {
      const sz: Record<string, number> = {};
      for (let c = 3; c <= 8; c++) {
        const lbl = boysHdr[c];
        const val = row[c];
        if (lbl && val && typeof val === 'number' && val > 0) sz[String(lbl)] = safeInt(val);
      }
      if (!Object.keys(sz).length) continue;
      items.push({
        lot, flag: flag === 'None' ? null : flag, model, brand,
        category: cat, aisle, shipdate: String(row[shipC] ?? ''), ttl,
        sizeSystem: 'boys_tpants', sizes: sz
      } as ParsedItem);
      continue;
    }
    const reg = extractSizes(hdr, row, 3, 17);
    if (!Object.keys(reg).length) continue;
    items.push({
      lot, flag: flag === 'None' ? null : flag, model, brand,
      category: cat, aisle, shipdate: String(row[shipC] ?? ''), ttl,
      sizeSystem: 'standard', regular: reg, short: {}, long: {}
    } as ParsedItem);
  }
  return items;
}
