// Thin wrappers around buildStandardSuits for brands that share the same
// Suit-shaped sheet layout: Bertolini, Enzo, Vincenzi, Carlo Lusso.
import type { ParsedItem, RawCategory } from '$lib/types';
import { buildStandardSuits } from '../standard';
import type { Row } from '../core';

export function parseBertoliniSuits(
  raw: Row[],
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const secR = (raw[4] ?? []) as Row;
  const hdr = (raw[5] ?? []) as Row;
  let shortS = 17, longS = 26, aisleC = 40;
  const shipC = 42;
  secR.forEach((v, i) => {
    const s = String(v ?? '').toUpperCase();
    if (s === 'SHORT' && i > 10) shortS = i;
    if (s === 'LONG' && i > 20) longS = i;
    if (s === 'AISLE' || s === '#') aisleC = i;
  });
  return buildStandardSuits({
    raw, startRow: 6, hdr, shortS, longS, aisleC, shipC,
    brand: 'Bertolini', memory
  });
}

export function parseEnzoSuits(
  raw: Row[],
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const secR = (raw[4] ?? []) as Row;
  const vestSubHdr = (raw[5] ?? []) as Row;
  const vestChestHdr = (raw[6] ?? []) as Row;
  const hdr = (raw[7] ?? []) as Row;
  let shortS = 17, longS = 26, aisleC = 42;
  const shipC = 43;
  secR.forEach((v, i) => {
    const s = String(v ?? '').toUpperCase();
    if (s === 'SHORT' && i > 10) shortS = i;
    if (s === 'LONG' && i > 20) longS = i;
  });
  // Enzo: AISLE label is in hdr (row 7), actual data is one column to the right
  const ha = hdr.findIndex((v, i) => i > 30 && String(v ?? '').toUpperCase() === 'AISLE');
  if (ha >= 0) aisleC = ha;
  return buildStandardSuits({
    raw, startRow: 8, hdr, shortS, longS, aisleC, shipC,
    brand: 'Enzo', vestSubHdr, vestChestHdr, memory
  });
}

export function parseVincenziSuits(
  raw: Row[],
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const secR = (raw[5] ?? []) as Row;
  const hdr = (raw[7] ?? []) as Row;
  let shortS = 17, longS = 25, aisleC = 38;
  const shipC = 39;
  secR.forEach((v, i) => {
    const s = String(v ?? '').toUpperCase();
    if (s === 'SHORT' && i > 10) shortS = i;
    if (s === 'LONG' && i > 20) longS = i;
    if (s === 'AISLE' || s === '#') aisleC = i;
  });
  return buildStandardSuits({
    raw, startRow: 8, hdr, shortS, longS, aisleC, shipC,
    brand: 'Vincenzi', priceInCol1: true, memory
  });
}

export function parseCarloSuits(
  raw: Row[],
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const secR = (raw[3] ?? []) as Row;
  const hdr = (raw[4] ?? []) as Row;
  let shortS = 19, longS = 27, aisleC = 43;
  const shipC = 45;
  secR.forEach((v, i) => {
    const s = String(v ?? '').toUpperCase();
    if (s === 'SHORT' && i > 10) shortS = i;
    if (s === 'LONG' && i > 20) longS = i;
    if (s === 'AISLE' || s === '#') aisleC = i;
  });
  return buildStandardSuits({
    raw, startRow: 5, hdr, shortS, longS, aisleC, shipC,
    brand: 'Carlo Lusso', memory
  });
}
