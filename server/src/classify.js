// Classification rules — ported verbatim from index.html (DEFAULT_RULES, classifyModel,
// getSizeSystem). The only change: `memory` (per-model manual overrides) is passed in
// from the DB (category_overrides table) instead of localStorage.

export const DEFAULT_RULES = [
  { p: 'will arrive|CANCELLED|cutting#|arrive on|minimum order', c: '__SKIP__' },
  { p: '\\bjean\\b|\\bjeans\\b|shorts', c: 'Jeans' },
  { p: '\\bshirt\\b|linen.shirt|LayDown|FrenchCuff|Adj\\.Convert|Adj\\.Slim|Linen-Shirt|Clean$|Slim-Fit$', c: 'Shirt' },
  { p: 'TUX.*\\.(?:Black|White|Navy|Tan|Ivory|Charcoal|Grey|Gray)\\s+Pants', c: 'Suit' },
  { p: '\\bpants?\\b', c: 'Pants' },
  { p: 'Rental BOYS\\.Pants|boys.*pants|BOYS.*PANT', c: 'Pants' },
  { p: 'jacket|blazer|BLZR|DinnerJacket|Carcoat|KnitCoat|Topcoat|Reversible', c: 'Jacket' },
  { p: '^Rental\\.Vest|^SATIN.?VEST|^ARLAN\\.?Vest|^ARLAN-Vest|^Arlan-Vest|Rental\\.BOYS-Vest|SATIN-VEST|Rental\\.?\\s*Boys\\s*Vest', c: 'Vest' },
  { p: '^Vest$|^Vest\\s*\\(', c: 'Vest' },
  { p: 'BOYS[\\._\\-]|BOYS\\+|HUSKY\\.BOYS|BOYS-Suit|BOYS_2BV', c: 'Boys' },
  { p: 'TUX|Tuxedo|Adj\\.2B|Adj\\.EuroSlim|SHAWL\\.TUX|TAIL|\\+Vest\\b|\\bSuit\\b', c: 'Suit' },
  { p: '2BV|3BV|1BV|1BP|DB[\\._\\-]|Euro|Portly|Peak.Lapel|Walton|Manchester|NoP|Slim|Savvy|Arlan|Semi-Slim|Notch|DB-Suit', c: 'Suit' },
];

// Build a classifyModel(model) closure bound to a given overrides map.
export function makeClassifier(overrides = {}) {
  return function classifyModel(m) {
    if (overrides[m]) return overrides[m];
    for (const r of DEFAULT_RULES) {
      try {
        if (new RegExp(r.p, 'i').test(m)) return r.c;
      } catch {}
    }
    return '__UNCLASSIFIED__';
  };
}

export function getSizeSystem(m) {
  if (/BOYS\+|HUSKY\.BOYS|BOYS\.2BV|BOYS-Suit|Rental\.BOYS-Jacket/i.test(m)) return 'boys_numeric';
  if (/Rental\.BOYS-Vest|BOYS_2BV\.Jacket/i.test(m)) return 'boys_bxs';
  if (/Rental BOYS\.Pants|boys.*pants/i.test(m)) return 'boys_pants';
  if (/BOYS.*PANT|^BOYS-Pants/i.test(m)) return 'boys_tpants';
  if (/rental.*vest|vest.*rental|Roland.?Vest/i.test(m)) return 'vest_xs';
  if (/\bshirt\b|linen.shirt|LayDown|FrenchCuff|Linen-Shirt|Clean$|Slim-Fit$/i.test(m)) return 'shirt';
  if (/jean|jeans|shorts/i.test(m)) return 'jeans';
  return 'standard';
}
