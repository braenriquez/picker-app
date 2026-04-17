import * as XLSX from 'xlsx';
import type { Item, ParsedItem, RawCategory, UnclassifiedItem } from '$lib/types';
import type { Row } from './core';
import { parseBertoliniSuits, parseEnzoSuits, parseVincenziSuits, parseCarloSuits } from './brands/simple';
import { parseGiorgioSuits, parseGiorgioPants } from './brands/giorgio';
import { parseMantoniSuits, parseMantoniPants } from './brands/mantoni';
import { parseJacketsAllBrands } from './brands/jackets';
import { parseShirts } from './brands/shirts';
import { parseJeans } from './brands/jeans';

const SKIP_SHEETS = new Set([
  'SHEET1', 'MAN60805 (2)', 'GF7.22.05', '62805', 'CLOSE (2)', '80605',
  'CHART1', 'CHART2', 'CHART3', 'CHART4', 'CHART5'
]);

function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  memory: Record<string, RawCategory>
): ParsedItem[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: null });
  const su = sheetName.toUpperCase();
  if (su === 'ALL DRESS SHIRTS') return parseShirts(raw);
  if (su === 'JEANS') return parseJeans(raw);
  if (su === 'JACKETS ALL BRANDS') return parseJacketsAllBrands(raw, memory);
  if (su === 'PANTS-MANTONI-LF') return parseMantoniPants(raw, memory);
  if (su === 'MANTONI SUITS') return parseMantoniSuits(raw, memory);
  if (su === 'VINCENZI SUITS') return parseVincenziSuits(raw, memory);
  if (su.includes('CARLO LUSSO') && su.includes('SUIT')) return parseCarloSuits(raw, memory);
  if (su.includes('GIORGIO') && su.includes('SUIT')) return parseGiorgioSuits(raw, memory);
  if (su === 'SUIT') {
    const title = String((raw[1] ?? [])[0] ?? '').toUpperCase();
    return title.includes('ENZO')
      ? parseEnzoSuits(raw, memory)
      : parseBertoliniSuits(raw, memory);
  }
  if (su.includes('SUIT')) return parseBertoliniSuits(raw, memory);
  if (su.includes('PANTS')) return parseGiorgioPants(raw, memory);
  return [];
}

export interface ParseResult {
  items: Item[];
  unclassified: UnclassifiedItem[];
}

export interface ParseProgress {
  phase: 'reading' | 'parsing' | 'classifying' | 'done';
  current?: string;
  completed: number;
  total: number;
}

/** Parse an .xlsx/.xls file into items and unclassified entries. Calls
 *  `onProgress` between sheets so the UI can surface progress. */
export async function parseWorkbook(
  file: File,
  memory: Record<string, RawCategory>,
  onProgress?: (p: ParseProgress) => void
): Promise<ParseResult> {
  onProgress?.({ phase: 'reading', completed: 0, total: 1 });
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const sheets = wb.SheetNames.filter(
    (sn) => !SKIP_SHEETS.has(sn.toUpperCase()) && !sn.toUpperCase().startsWith('CHART')
  );
  const items: Item[] = [];
  const unclassified: UnclassifiedItem[] = [];
  for (let i = 0; i < sheets.length; i++) {
    const sn = sheets[i];
    onProgress?.({ phase: 'parsing', current: sn, completed: i, total: sheets.length });
    const parsed = parseSheet(wb, sn, memory);
    for (const p of parsed) {
      if (p.category.startsWith('__')) {
        unclassified.push(p as UnclassifiedItem);
      } else {
        items.push(p as Item);
      }
    }
  }
  onProgress?.({ phase: 'done', completed: sheets.length, total: sheets.length });
  return { items, unclassified };
}
