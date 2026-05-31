// Sheet parsers — ported verbatim from index.html (lines ~700-1280). The browser used
// SheetJS via <script>; here we receive an XLSX module and a classifyModel closure.
// Keeping the bodies byte-for-byte identical to the PWA is deliberate: any drift would
// produce inventory that disagrees with what users saw when parsing in-browser.

import { getSizeSystem } from './classify.js';

// --- pure helpers (verbatim) ---
const safeInt = (v) => { const n = parseInt(v); return isNaN(n) || n <= 0 ? 0 : n; };
const isSkip = (m) => !m || /will arrive|CANCELLED|cutting#|arrive on|minimum order/i.test(String(m));

function extractSizes(hdr, row, s, e) {
  const out = {};
  for (let c = s; c <= e; c++) {
    const lbl = hdr[c], val = row[c];
    if (lbl != null && String(lbl).trim().toUpperCase() === 'TTL') continue;
    if (lbl != null && val && typeof val === 'number' && val > 0) out[String(lbl)] = safeInt(val);
  }
  return out;
}
function findTTLCol(hdr) { for (let i = 0; i < hdr.length; i++) { const s = String(hdr[i] || '').trim().toUpperCase(); if (s === 'TTL' || s === 'TOTAL') return i; } return -1; }

function normalizeAisle(v) {
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

// makeParser binds the parser bank to an XLSX module + a classifyModel closure.
export function makeParser({ XLSX, classifyModel }) {
  function parseSheet(wb, sn) {
    const ws = wb.Sheets[sn]; if (!ws) return [];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const su = sn.toUpperCase();
    if (su === 'ALL DRESS SHIRTS') return parseShirts(raw);
    if (su === 'JEANS') return parseJeans(raw);
    if (su === 'JACKETS ALL BRANDS') return parseJacketsAllBrands(raw);
    if (su === 'PANTS-MANTONI-LF') return parseMantoniPants(raw);
    if (su === 'MANTONI SUITS') return parseMantoniSuits(raw);
    if (su === 'VINCENZI SUITS') return parseVincenziSuits(raw);
    if (su.includes('CARLO LUSSO') && su.includes('SUIT')) return parseCarloSuits(raw);
    if (su.includes('GIORGIO') && su.includes('SUIT')) return parseGiorgioSuits(raw);
    if (su === 'SUIT') {
      const title = String((raw[1] || [])[0] || '').toUpperCase();
      return title.includes('ENZO') ? parseEnzoSuits(raw) : parseBertoliniSuits(raw);
    }
    if (su.includes('SUIT')) return parseBertoliniSuits(raw);
    if (su.includes('PANTS')) return parseGiorgioPants(raw);
    return [];
  }

  function parseBertoliniSuits(raw) {
    const secR = raw[4] || [], hdr = raw[5] || [];
    let shortS = 17, longS = 26, aisleC = 40, shipC = 42;
    secR.forEach((v, i) => { const s = String(v || '').toUpperCase(); if (s === 'SHORT' && i > 10) shortS = i; if (s === 'LONG' && i > 20) longS = i; if (s === 'AISLE' || s === '#') aisleC = i; });
    return buildStandardSuits(raw, 6, hdr, shortS, longS, aisleC, shipC, 'Bertolini');
  }

  function parseEnzoSuits(raw) {
    const secR = raw[4] || [], vestSubHdr = raw[5] || [], vestChestHdr = raw[6] || [], hdr = raw[7] || [];
    let shortS = 17, longS = 26, aisleC = 42, shipC = 43;
    secR.forEach((v, i) => { const s = String(v || '').toUpperCase(); if (s === 'SHORT' && i > 10) shortS = i; if (s === 'LONG' && i > 20) longS = i; });
    const ha = hdr.findIndex((v, i) => i > 30 && String(v || '').toUpperCase() === 'AISLE');
    if (ha >= 0) aisleC = ha;
    return buildStandardSuits(raw, 8, hdr, shortS, longS, aisleC, shipC, 'Enzo', false, vestSubHdr, vestChestHdr);
  }

  function parseVincenziSuits(raw) {
    const secR = raw[5] || [], hdr = raw[7] || [];
    let shortS = 17, longS = 25, aisleC = 38, shipC = 39;
    secR.forEach((v, i) => { const s = String(v || '').toUpperCase(); if (s === 'SHORT' && i > 10) shortS = i; if (s === 'LONG' && i > 20) longS = i; if (s === 'AISLE' || s === '#') aisleC = i; });
    return buildStandardSuits(raw, 8, hdr, shortS, longS, aisleC, shipC, 'Vincenzi', true);
  }

  function parseCarloSuits(raw) {
    const secR = raw[3] || [], hdr = raw[4] || [];
    let shortS = 19, longS = 27, aisleC = 43, shipC = 45;
    secR.forEach((v, i) => { const s = String(v || '').toUpperCase(); if (s === 'SHORT' && i > 10) shortS = i; if (s === 'LONG' && i > 20) longS = i; if (s === 'AISLE' || s === '#') aisleC = i; });
    longS -= 2;
    return buildStandardSuits(raw, 5, hdr, shortS, longS, aisleC, shipC, 'Carlo Lusso');
  }

  function buildStandardSuits(raw, startRow, hdr, shortS, longS, aisleC, shipC, brand, priceInCol1 = false, vestSubHdr = null, vestChestHdr = null) {
    const ttlC = findTTLCol(hdr);
    const items = [];
    for (let i = startRow; i < raw.length; i++) {
      const row = raw[i]; if (!row) continue;
      const lot = String(row[0] || '').trim(); if (!lot || lot.startsWith('=')) continue;
      const flag = priceInCol1 ? null : (String(row[1] || '').trim() || null);
      const model = String(row[2] || '').trim(); if (isSkip(model)) continue;
      let cat = classifyModel(model); if (cat === '__SKIP__') continue; if (cat === '__UNCLASSIFIED__' && /vest/i.test(model)) cat = 'Vest';
      const sys = getSizeSystem(model);
      const ttl = ttlC >= 0 ? safeInt(row[ttlC]) || null : null;
      const base = { lot, flag: flag === 'None' ? null : flag, model, brand, category: cat, aisle: normalizeAisle(row[aisleC]), shipdate: String(row[shipC] || ''), ttl, sizeSystem: sys };
      if (sys === 'vest_xs' && vestSubHdr) {
        const sz = {}, meta = {};
        for (let c = 0; c < vestSubHdr.length; c++) {
          const lbl = vestSubHdr[c]; const val = row[c];
          if (lbl != null && String(lbl).trim() && val && typeof val === 'number' && val > 0) {
            const k = String(lbl).trim();
            sz[k] = safeInt(val);
            if (vestChestHdr && vestChestHdr[c] != null && String(vestChestHdr[c]).trim()) meta[k] = String(vestChestHdr[c]).trim();
          }
        }
        if (!Object.keys(sz).length) continue;
        const item = { ...base, sizes: sz };
        if (Object.keys(meta).length) item.sizeMeta = meta;
        items.push(item);
        continue;
      }
      const reg = extractSizes(hdr, row, 3, shortS - 1);
      const short = extractSizes(hdr, row, shortS, longS - 1);
      const long_ = extractSizes(hdr, row, longS, aisleC - 2);
      if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
      items.push({ ...base, regular: reg, short, long: long_ });
    }
    return items;
  }

  function parseGiorgioSuits(raw) {
    const vestHdr = raw[4] || [], boysHdr = raw[5] || [], suitHdr = raw[6] || [];
    const secR = raw[3] || [];
    let shortS = 24, longS = 41, aisleC = 61, shipC = 63;
    const ttlC = findTTLCol(suitHdr);
    secR.forEach((v, i) => { const s = String(v || '').toUpperCase(); if (s === 'SHORT' && i > 10) shortS = i; if (s === 'LONG' && i > 20) longS = i; if (s === 'AISLE' || s === '#') aisleC = i; });
    longS--;
    const items = [];
    for (let i = 7; i < raw.length; i++) {
      const row = raw[i]; if (!row) continue;
      const lot = String(row[0] || '').trim(); if (!lot || lot.startsWith('=')) continue;
      const flag = String(row[1] || '').trim() || null;
      const model = String(row[2] || '').trim(); if (isSkip(model)) continue;
      const cat = classifyModel(model); if (cat === '__SKIP__') continue;
      const sys = getSizeSystem(model);
      const aisle = normalizeAisle(row[aisleC]);
      const ttl = ttlC >= 0 ? safeInt(row[ttlC]) || null : null;
      const base = { lot, flag: flag === 'None' ? null : flag, model, brand: 'Giorgio Fiorelli', category: cat, aisle, shipdate: String(row[shipC] || ''), ttl, sizeSystem: sys };
      if (sys === 'vest_xs') { const sz = extractSizes(vestHdr, row, 3, 23); if (!Object.keys(sz).length) continue; items.push({ ...base, sizes: sz }); }
      else if (sys === 'boys_numeric') { const sz = extractSizes(boysHdr, row, 24, 35); if (!Object.keys(sz).length) continue; items.push({ ...base, sizes: sz }); }
      else if (sys === 'boys_bxs') { const sz = extractSizes(boysHdr, row, 3, 7); if (!Object.keys(sz).length) continue; items.push({ ...base, sizes: sz }); }
      else {
        const reg = extractSizes(suitHdr, row, 3, shortS - 1);
        const short = extractSizes(suitHdr, row, shortS, longS - 1);
        const long_ = extractSizes(suitHdr, row, longS, aisleC - 2);
        if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
        items.push({ ...base, regular: reg, short, long: long_ });
      }
    }
    return items;
  }

  function parseGiorgioPants(raw) {
    const boysHdr = raw[4] || [], hdr = raw[5] || [];
    const secR = raw[3] || [];
    let shortS = 25, longS = 44, aisleC = 67, shipC = 69;
    const ttlC = findTTLCol(hdr);
    secR.forEach((v, i) => { const s = String(v || '').toUpperCase(); if (s === 'SHORT' && i > 10) shortS = i; if (s === 'LONG' && i > 20) longS = i; if (s === 'AISLE' || s === '#') aisleC = i; });
    const items = [];
    for (let i = 6; i < raw.length; i++) {
      const row = raw[i]; if (!row) continue;
      const lot = String(row[0] || '').trim();
      if (!lot || lot.toUpperCase().includes('CARLO LUSSO')) continue;
      const flag = String(row[1] || '').trim() || null;
      const model = String(row[2] || '').trim(); if (isSkip(model)) continue;
      const brand = lot.startsWith('C') ? 'Carlo Lusso' : 'Giorgio Fiorelli';
      const cat = classifyModel(model); if (cat === '__SKIP__') continue;
      const sys = getSizeSystem(model);
      const aisle = normalizeAisle(row[aisleC]);
      const ttl = ttlC >= 0 ? safeInt(row[ttlC]) || null : null;
      if (sys === 'boys_pants') { const sz = extractSizes(boysHdr, row, 3, 8); if (!Object.keys(sz).length) continue; items.push({ lot, flag: flag === 'None' ? null : flag, model, brand, category: 'Pants', aisle, shipdate: String(row[shipC] || ''), ttl, sizeSystem: sys, sizes: sz }); }
      else {
        const reg = extractSizes(hdr, row, 3, shortS - 1);
        const short = extractSizes(hdr, row, shortS, longS - 1);
        const long_ = extractSizes(hdr, row, longS, aisleC - 2);
        if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
        items.push({ lot, flag: flag === 'None' ? null : flag, model, brand, category: 'Pants', aisle, shipdate: String(row[shipC] || ''), ttl, sizeSystem: 'standard', regular: reg, short, long: long_ });
      }
    }
    return items;
  }

  function parseMantoniSuits(raw) {
    const secR = raw[4] || [], shortSubHdr = raw[5] || [], hdr = raw[6] || [];
    let shortS = 19, longS = 35, aisleC = 50, shipC = 52;
    secR.forEach((v, i) => { const s = String(v || '').toUpperCase(); if (s === 'SHORT' && i > 10) shortS = i; if (s === 'LONG' && i > 20) longS = i; if (s === 'AISLE' || s === '#') aisleC = i; });
    longS--;
    const ttlC = findTTLCol(hdr);
    const items = [];
    for (let i = 7; i < raw.length; i++) {
      const row = raw[i]; if (!row) continue;
      const lot = String(row[0] || '').trim(); if (!lot || lot.startsWith('=')) continue;
      const flag = String(row[1] || '').trim() || null;
      const model = String(row[2] || '').trim(); if (isSkip(model)) continue;
      const cat = classifyModel(model); if (cat === '__SKIP__') continue;
      const sys = getSizeSystem(model);
      const aisle = normalizeAisle(row[aisleC]);
      const ttl = ttlC >= 0 ? safeInt(row[ttlC]) || null : null;
      const base = { lot, flag: flag === 'None' ? null : flag, model, brand: 'Mantoni', category: cat, aisle, shipdate: String(row[shipC] || ''), ttl, sizeSystem: sys };
      if (sys === 'vest_xs' || sys === 'boys_bxs' || sys === 'boys_numeric') {
        const sz = {};
        for (let c = shortS; c < longS; c++) { const lbl = shortSubHdr[c]; const val = row[c]; if (lbl && val && typeof val === 'number' && val > 0) sz[String(lbl)] = safeInt(val); }
        if (!Object.keys(sz).length) continue;
        items.push({ ...base, sizes: sz });
      } else {
        const reg = extractSizes(hdr, row, 3, shortS - 1);
        const short = extractSizes(hdr, row, shortS, longS - 1);
        const long_ = extractSizes(hdr, row, longS, aisleC - 2);
        if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
        items.push({ ...base, regular: reg, short, long: long_ });
      }
    }
    return items;
  }

  function parseMantoniPants(raw) {
    const boysHdr = raw[3] || [], hdr = raw[4] || [];
    const aisleC = 20, shipC = 22;
    const ttlC = findTTLCol(hdr);
    const items = [];
    for (let i = 5; i < raw.length; i++) {
      const row = raw[i]; if (!row) continue;
      const lot = String(row[0] || '').trim();
      if (!lot || /ENZO PANTS|MANTONI/i.test(lot)) continue;
      const flag = String(row[1] || '').trim() || null;
      const model = String(row[2] || '').trim(); if (isSkip(model)) continue;
      const cat = classifyModel(model); if (cat === '__SKIP__') continue;
      const brand = lot.toUpperCase().startsWith('E') ? 'Enzo' : 'Mantoni';
      const aisle = normalizeAisle(row[aisleC]);
      const ttl = ttlC >= 0 ? safeInt(row[ttlC]) || null : null;
      if (/^BOYS-Pants/i.test(model)) {
        const sz = {};
        for (let c = 3; c <= 8; c++) { const lbl = boysHdr[c]; const val = row[c]; if (lbl && val && typeof val === 'number' && val > 0) sz[String(lbl)] = safeInt(val); }
        if (!Object.keys(sz).length) continue;
        items.push({ lot, flag: flag === 'None' ? null : flag, model, brand, category: 'Pants', aisle, shipdate: String(row[shipC] || ''), ttl, sizeSystem: 'boys_tpants', sizes: sz });
        continue;
      }
      const reg = extractSizes(hdr, row, 3, 17);
      if (!Object.keys(reg).length) continue;
      items.push({ lot, flag: flag === 'None' ? null : flag, model, brand, category: 'Pants', aisle, shipdate: String(row[shipC] || ''), ttl, sizeSystem: 'standard', regular: reg, short: {}, long: {} });
    }
    return items;
  }

  function parseJacketsAllBrands(raw) {
    const secR = raw[4] || [], letterHdr = raw[5] || [], chestHdr = raw[6] || [], hdr = raw[7] || [];
    let shortS = 17, longS = 27, aisleC = 40, shipC = 41;
    secR.forEach((v, i) => { const s = String(v || '').toUpperCase(); if (s === 'SHORT' && i > 10) shortS = i; if (s === 'LONG' && i > 20) longS = i; if (s === 'AISLE' || s === '#') aisleC = i; });
    longS--;
    const ttlC = findTTLCol(hdr);
    const brandMap = { 'MANTONI JACKETS:': 'Mantoni', 'BERTOLINI JACKETS:': 'Bertolini', 'ENZO JACKETS:': 'Enzo' };
    let currentBrand = 'Mantoni';
    const items = [];
    for (let i = 8; i < raw.length; i++) {
      const row = raw[i]; if (!row) continue;
      const lot = String(row[0] || '').trim(); if (!lot) continue;
      if (brandMap[lot]) { currentBrand = brandMap[lot]; continue; }
      if (lot.endsWith(':')) continue;
      const flag = typeof row[1] === 'number' ? null : (String(row[1] || '').trim() || null);
      let model = String(row[2] || '').trim(); if (isSkip(model)) continue;
      let lotFinal = lot;
      const swapped = !/\d/.test(lot) && !!model;
      if (swapped) { lotFinal = model; model = lot; }
      const classifyTarget = swapped ? lotFinal : model;
      let cat = classifyModel(classifyTarget); if (cat === '__SKIP__') continue; if (cat === '__UNCLASSIFIED__') cat = /vest/i.test(classifyTarget) ? 'Vest' : 'Jacket';
      const reg = extractSizes(hdr, row, 3, shortS - 1);
      const short = extractSizes(hdr, row, shortS, longS - 1);
      const long_ = extractSizes(hdr, row, longS, aisleC - 2);
      if (!Object.keys(reg).length && !Object.keys(short).length && !Object.keys(long_).length) continue;
      const ttl = ttlC >= 0 ? safeInt(row[ttlC]) || null : null;
      if (swapped) {
        const sizes = {};
        for (let c = 0; c < letterHdr.length; c++) {
          const lbl = letterHdr[c]; const val = row[c];
          if (lbl != null && String(lbl).trim() && val && typeof val === 'number' && val > 0) {
            const k = String(lbl).trim();
            sizes[k] = (sizes[k] || 0) + safeInt(val);
          }
        }
        if (!Object.keys(sizes).length) continue;
        items.push({ lot: lotFinal, flag, model, brand: currentBrand, category: cat, aisle: normalizeAisle(row[aisleC]), shipdate: String(row[shipC] || ''), ttl, sizeSystem: 'vest_xs', sizes });
      } else {
        items.push({ lot: lotFinal, flag, model, brand: currentBrand, category: cat, aisle: normalizeAisle(row[aisleC]), shipdate: String(row[shipC] || ''), ttl, sizeSystem: 'standard', regular: reg, short, long: long_ });
      }
    }
    return items;
  }

  function parseShirts(raw) {
    const neckHdr = raw[7] || [];
    const boysHdr = raw[6] || [];
    const aisleC = 38, shipC = 39;
    const ttlC = findTTLCol(neckHdr);
    const sleeveSec = raw[4] || [];
    const sleeveLabels = {};
    const slvLbls = [];
    for (let c = 3; c <= 37; c++) { const v = sleeveSec[c]; if (v != null && String(v).trim()) slvLbls.push(String(v).trim().replace(/\s/g, '').replace(/\//g, '-')); }
    const groupStarts = [3]; let prevN = -1;
    for (let c = 4; c <= 36; c++) { const v = neckHdr[c]; if (v == null) continue; const n = parseFloat(String(v)); if (!isNaN(n) && n <= 30 && prevN > 0 && n < prevN) groupStarts.push(c); if (!isNaN(n) && n <= 30) prevN = n; }
    for (let g = 0; g < groupStarts.length; g++) { const s = groupStarts[g], e = g + 1 < groupStarts.length ? groupStarts[g + 1] - 1 : 36; const lbl = slvLbls[g] || `sleeve${g}`; for (let c = s; c <= e; c++) sleeveLabels[c] = lbl; }
    const brandMap = { 'ENZO DRESS SHIRTS:': 'Enzo', 'MANTONI 100% COTTON DRESS SHIRTS:': 'Mantoni', 'LINEN SHIRTS': 'Mantoni', 'GIORGIO FIORELLI DRESS SHIRTS:': 'Giorgio Fiorelli', 'ADJUSTABLE CONVERTIBLE SHIRTS': 'Giorgio Fiorelli' };
    const LETTER_TOKEN = /^(?:S|M|L|XL|XXL|2XL|3XL|4XL|5XL|S3|M3|L3|XL3|M5|L5|XL5|2XL5|3XL5|4XL5|L7|XL7|2XL7|3XL7|4XL7)$/i;
    function isLetterSubHdr(row) {
      if (!row || String(row[0] || '').trim()) return false;
      for (let c = 3; c <= 20; c++) { const v = row[c]; if (v != null && LETTER_TOKEN.test(String(v).trim())) return true; }
      return false;
    }
    let currentBrand = 'Enzo', currentHdr = neckHdr, currentMeta = null, isSpec = false;
    const items = [];
    for (let i = 8; i < raw.length; i++) {
      const row = raw[i]; if (!row) continue;
      const lot = String(row[0] || '').trim();
      if (lot && brandMap[lot]) {
        currentBrand = brandMap[lot];
        const spec = lot === 'LINEN SHIRTS' || lot === 'ADJUSTABLE CONVERTIBLE SHIRTS';
        if (spec) {
          currentHdr = row;
          currentMeta = raw[i + 1] || [];
          isSpec = true;
          i += 1;
        } else {
          currentHdr = neckHdr; currentMeta = null; isSpec = false;
        }
        continue;
      }
      if (!lot && isLetterSubHdr(row)) {
        currentHdr = row;
        currentMeta = raw[i + 1] || [];
        isSpec = true;
        i += 1;
        continue;
      }
      if (!lot) continue;
      if (lot.endsWith(':')) continue;
      const flag = String(row[1] || '').trim() || null;
      const model = String(row[2] || '').trim(); if (isSkip(model)) continue;
      const aisle = normalizeAisle(row[aisleC]);
      if (/^BOYS[_\-]/i.test(model)) {
        const sz = {};
        for (let c = 3; c <= 15; c++) {
          const lbl = boysHdr[c], val = row[c];
          if (lbl != null && String(lbl).trim() && val && typeof val === 'number' && val > 0) {
            const k = String(lbl).trim();
            sz[k] = (sz[k] || 0) + safeInt(val);
          }
        }
        if (!Object.keys(sz).length) continue;
        const ttl = ttlC >= 0 ? safeInt(row[ttlC]) || null : null;
        items.push({ lot, flag: flag === 'None' ? null : flag, model, brand: currentBrand, category: 'Shirt', aisle, shipdate: String(row[shipC] || ''), ttl, sizeSystem: 'boys_numeric', sizes: sz });
        continue;
      }
      const sizes = {}; const sizeMeta = {};
      for (let c = 3; c <= 35; c++) {
        const hdrVal = currentHdr[c]; if (hdrVal == null || String(hdrVal).trim() === '') continue;
        const val = row[c];
        if (val && typeof val === 'number' && val > 0) {
          const sleeve = sleeveLabels[c] || 'Other';
          const tag = String(hdrVal).trim();
          const lbl = `${sleeve}/${tag}`;
          sizes[lbl] = (sizes[lbl] || 0) + safeInt(val);
          if (isSpec && currentMeta) {
            const chest = currentMeta[c];
            if (chest != null && String(chest).trim() !== '') sizeMeta[lbl] = String(chest).trim();
          }
        }
      }
      if (!Object.keys(sizes).length) continue;
      const ttl = ttlC >= 0 ? safeInt(row[ttlC]) || null : null;
      const item = { lot, flag: flag === 'None' ? null : flag, model, brand: currentBrand, category: 'Shirt', aisle, shipdate: String(row[shipC] || ''), ttl, sizeSystem: 'shirt', sizes };
      if (Object.keys(sizeMeta).length) item.sizeMeta = sizeMeta;
      items.push(item);
    }
    return items;
  }

  function parseJeans(raw) {
    const hdr = raw[3] || [];
    const aisleC = 17, shipC = 19;
    const ttlC = findTTLCol(hdr);
    const items = [];
    for (let i = 4; i < raw.length; i++) {
      const row = raw[i]; if (!row) continue;
      const lot = String(row[0] || '').trim(); if (!lot || lot.startsWith('=')) continue;
      const styleVal = String(row[3] || '').trim();
      if ((styleVal && isSkip(styleVal)) || isSkip(lot)) continue;
      const model = 'Jeans';
      const aisleRaw = normalizeAisle(row[aisleC]);
      const aisle = aisleRaw != null ? `Jeans - ${aisleRaw}` : null;
      const sizes = {};
      for (let c = 4; c <= 15; c++) {
        const sz = hdr[c], val = row[c];
        if (sz != null && val && typeof val === 'number' && val > 0) sizes[String(sz)] = safeInt(val);
      }
      if (!Object.keys(sizes).length) continue;
      const ttl = ttlC >= 0 ? safeInt(row[ttlC]) || null : null;
      items.push({ lot, flag: String(row[1] || '').trim() || null, model, brand: 'Enzo', category: 'Jeans', aisle, shipdate: String(row[shipC] || ''), ttl, sizeSystem: 'jeans', sizes });
    }
    return items;
  }

  // Skip the same non-inventory sheets the PWA skips.
  const SKIP_SHEETS = new Set(['SHEET1', 'MAN60805 (2)', 'GF7.22.05', '62805', 'CLOSE (2)', '80605', 'CHART1', 'CHART2', 'CHART3', 'CHART4', 'CHART5']);

  // parseWorkbook: buffer -> { items, unclassified } using the same merge/skip rules as importFile().
  function parseWorkbook(buf) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const items = [], unclassified = [];
    for (const sn of wb.SheetNames) {
      if (SKIP_SHEETS.has(sn.toUpperCase()) || sn.toUpperCase().startsWith('CHART')) continue;
      const parsed = parseSheet(wb, sn);
      parsed.forEach((item) => { if (item.category.startsWith('__')) unclassified.push(item); else items.push(item); });
    }
    return { items, unclassified };
  }

  return { parseWorkbook, parseSheet };
}
