import type { ParsedItem, RawCategory } from '$lib/types';
import { classifyModel, getSizeSystem } from '../classify';
import { extractSizes, findTTLCol, isSkip, normalizeAisle, safeInt, type Row } from '../core';

export function parseGiorgioSuits(
  raw: Row[],
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const vestHdr = (raw[4] ?? []) as Row;
  const boysHdr = (raw[5] ?? []) as Row;
  const suitHdr = (raw[6] ?? []) as Row;
  const secR = (raw[3] ?? []) as Row;
  let shortS = 24, longS = 41, aisleC = 61;
  const shipC = 63;
  const ttlC = findTTLCol(suitHdr);
  secR.forEach((v, i) => {
    const s = String(v ?? '').toUpperCase();
    if (s === 'SHORT' && i > 10) shortS = i;
    if (s === 'LONG' && i > 20) longS = i;
    if (s === 'AISLE' || s === '#') aisleC = i;
  });
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
      lot, flag: flag === 'None' ? null : flag, model, brand: 'Giorgio Fiorelli',
      category: cat, aisle, shipdate: String(row[shipC] ?? ''), ttl, sizeSystem: sys
    } as const;
    if (sys === 'vest_xs') {
      const sz = extractSizes(vestHdr, row, 3, 23);
      if (!Object.keys(sz).length) continue;
      items.push({ ...base, sizes: sz } as ParsedItem);
    } else if (sys === 'boys_numeric') {
      const sz = extractSizes(boysHdr, row, 24, 35);
      if (!Object.keys(sz).length) continue;
      items.push({ ...base, sizes: sz } as ParsedItem);
    } else if (sys === 'boys_bxs') {
      const sz = extractSizes(boysHdr, row, 3, 7);
      if (!Object.keys(sz).length) continue;
      items.push({ ...base, sizes: sz } as ParsedItem);
    } else {
      const reg = extractSizes(suitHdr, row, 3, shortS - 1);
      const short = extractSizes(suitHdr, row, shortS, longS - 1);
      const long_ = extractSizes(suitHdr, row, longS, aisleC - 2);
      if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
      items.push({ ...base, sizeSystem: 'standard', regular: reg, short, long: long_ } as ParsedItem);
    }
  }
  return items;
}

export function parseGiorgioPants(
  raw: Row[],
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const boysHdr = (raw[4] ?? []) as Row;
  const hdr = (raw[5] ?? []) as Row;
  const secR = (raw[3] ?? []) as Row;
  let shortS = 25, longS = 44, aisleC = 67;
  const shipC = 69;
  const ttlC = findTTLCol(hdr);
  secR.forEach((v, i) => {
    const s = String(v ?? '').toUpperCase();
    if (s === 'SHORT' && i > 10) shortS = i;
    if (s === 'LONG' && i > 20) longS = i;
    if (s === 'AISLE' || s === '#') aisleC = i;
  });
  const items: ParsedItem[] = [];
  for (let i = 6; i < raw.length; i++) {
    const row = raw[i];
    if (!row) continue;
    const lot = String(row[0] ?? '').trim();
    if (!lot || lot.toUpperCase().includes('CARLO LUSSO')) continue;
    const flag = String(row[1] ?? '').trim() || null;
    const model = String(row[2] ?? '').trim();
    if (isSkip(model)) continue;
    const brand = lot.startsWith('C') ? 'Carlo Lusso' : 'Giorgio Fiorelli';
    const cat = classifyModel(model, memory);
    if (cat === '__SKIP__') continue;
    const sys = getSizeSystem(model);
    const aisle = normalizeAisle(row[aisleC]);
    const ttl = ttlC >= 0 ? (safeInt(row[ttlC]) || null) : null;
    if (sys === 'boys_pants') {
      const sz = extractSizes(boysHdr, row, 3, 8);
      if (!Object.keys(sz).length) continue;
      items.push({
        lot, flag: flag === 'None' ? null : flag, model, brand,
        category: cat, aisle, shipdate: String(row[shipC] ?? ''), ttl,
        sizeSystem: sys, sizes: sz
      } as ParsedItem);
    } else {
      const reg = extractSizes(hdr, row, 3, shortS - 1);
      const short = extractSizes(hdr, row, shortS, longS - 1);
      const long_ = extractSizes(hdr, row, longS, aisleC - 2);
      if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
      items.push({
        lot, flag: flag === 'None' ? null : flag, model, brand,
        category: 'Pants', aisle, shipdate: String(row[shipC] ?? ''), ttl,
        sizeSystem: 'standard', regular: reg, short, long: long_
      } as ParsedItem);
    }
  }
  return items;
}
