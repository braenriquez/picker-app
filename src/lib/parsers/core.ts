// Low-level parsing helpers shared by every brand parser.
// Ported from index.html (Round 3 fixes baseline) without behavior changes.

export type Row = unknown[];

export const safeInt = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return isNaN(n) || n <= 0 ? 0 : n;
};

export const isSkip = (m: unknown): boolean =>
  !m || /will arrive|CANCELLED|cutting#|arrive on|minimum order/i.test(String(m));

/** Read numeric size columns [s..e] from a row, using `hdr` for size labels.
 *  TTL/TOTAL columns are skipped so they never leak into the "Long" chip set. */
export function extractSizes(hdr: Row, row: Row, s: number, e: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let c = s; c <= e; c++) {
    const lbl = hdr[c];
    const val = row[c];
    if (lbl == null) continue;
    const up = String(lbl).trim().toUpperCase();
    if (up === 'TTL' || up === 'TOTAL') continue;
    if (val && typeof val === 'number' && val > 0) {
      out[String(lbl)] = safeInt(val);
    }
  }
  return out;
}

/** Locate the TTL (total inventory) column index in a header row, or -1. */
export function findTTLCol(hdr: Row): number {
  for (let i = 0; i < hdr.length; i++) {
    const s = String(hdr[i] ?? '').trim().toUpperCase();
    if (s === 'TTL' || s === 'TOTAL') return i;
  }
  return -1;
}

/** Normalize an aisle cell into a number, string (e.g. "2F-12"), or null. */
export function normalizeAisle(v: unknown): number | string | null {
  if (v == null) return null;
  if (typeof v === 'number') return Math.round(v);
  let s = String(v).trim();
  if (!s || s === '0') return null;
  s = s.replace(/^\s*aisle\s*/i, '').trim();
  if (!s) return null;
  const n = parseFloat(s);
  if (!isNaN(n) && String(n) === s) return Math.round(n);
  return s;
}

/** Strip parenthetical content from a lot number for display-only use. */
export function truncateLot(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

// ── Size ordering helpers (for chip rendering) ────────────────────────────

const _LETTER_BASE = [
  'XXS', 'XS', 'XSL', 'S', 'SL', 'M', 'ML', 'L', 'LL',
  'XL', 'XLL', 'XXL', 'XXLL', 'XXXL', 'XXXLL',
  'XXXXL', 'XXXXLL', 'XXXXXL', 'XXXXXLL',
  'XXXXXXL', 'XXXXXXLL', 'XXXXXXXL', 'XXXXXXXLL'
];
const _BOYS_BASE = ['BXS', 'BS', 'BM', 'BL', 'BXL', 'BXXL'];

export function sizeLetterRank(s: unknown): number | null {
  if (s == null) return null;
  let k = String(s).trim().toUpperCase();
  // Expand "2XL" → "XXL", "3XL" → "XXXL" for uniform table lookup
  k = k.replace(/^(\d+)X/, (_, n) => 'X'.repeat(parseInt(n, 10) || 1) + 'X');
  let i = _BOYS_BASE.indexOf(k);
  if (i >= 0) return 1000 + i;
  i = _LETTER_BASE.indexOf(k);
  if (i >= 0) return 2000 + i;
  return null;
}

/** Comparator: numeric first, then letter rank, then alphabetical. Handles
 *  adjustable-shirt suffixes like "S3", "2XL5". */
export function sizeKeyCmp(a: string, b: string): number {
  const pa = parseFloat(a), pb = parseFloat(b);
  const aIsNum = !isNaN(pa) && String(pa) === a.trim();
  const bIsNum = !isNaN(pb) && String(pb) === b.trim();
  if (aIsNum && bIsNum) return pa - pb;
  const mA = a.trim().match(/^(.*?[A-Za-z])(\d*)$/);
  const mB = b.trim().match(/^(.*?[A-Za-z])(\d*)$/);
  const rA = mA ? sizeLetterRank(mA[1]) : null;
  const rB = mB ? sizeLetterRank(mB[1]) : null;
  if (rA != null && rB != null) {
    const sA = mA && mA[2] ? parseInt(mA[2], 10) : 0;
    const sB = mB && mB[2] ? parseInt(mB[2], 10) : 0;
    if (sA !== sB) return sA - sB;
    return rA - rB;
  }
  return a.localeCompare(b);
}

/** Sort key for aisles: numeric first, then "2F-NN" / "upstairs", then strings. */
export function aisleSortKey(a: number | string | null): [number, number, string] {
  if (a == null) return [3, 9999, ''];
  if (typeof a === 'number') return [1, a, ''];
  const s = String(a);
  const m2 = s.match(/^2F-?(\d+)/i);
  if (m2) return [2, parseInt(m2[1], 10), s];
  if (/^up/i.test(s)) return [2, 9000, s];
  const n = parseFloat(s);
  if (!isNaN(n)) return [1, n, ''];
  return [3, 9999, s];
}
