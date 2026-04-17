import type { ClassifyRule, RawCategory, SizeSystem } from '$lib/types';

/** User-editable rules are stored alongside these. DEFAULT_RULES runs after
 *  memory lookup, before final fallback to __UNCLASSIFIED__. Order matters. */
export const DEFAULT_RULES: ClassifyRule[] = [
  { p: 'will arrive|CANCELLED|cutting#|arrive on|minimum order', c: '__SKIP__' },
  { p: '\\bjean\\b|\\bjeans\\b|shorts', c: 'Jeans' },
  { p: '\\bshirt\\b|linen.shirt|LayDown|FrenchCuff|Adj\\.Convert|Adj\\.Slim|Linen-Shirt|Clean$|Slim-Fit$', c: 'Shirt' },
  { p: '\\bpants?\\b', c: 'Pants' },
  { p: 'Rental BOYS\\.Pants|boys.*pants|BOYS.*PANT', c: 'Pants' },
  { p: 'jacket|blazer|BLZR|DinnerJacket|Carcoat|KnitCoat|Topcoat|Reversible', c: 'Jacket' },
  { p: '^Rental\\.Vest|^SATIN.?VEST|^ARLAN\\.?Vest|^ARLAN-Vest|^Arlan-Vest|Rental\\.BOYS-Vest|SATIN-VEST|Rental\\.?\\s*Boys\\s*Vest', c: 'Vest' },
  { p: '^Vest$|^Vest\\s*\\(', c: 'Vest' },
  { p: 'BOYS[\\._\\-]|BOYS\\+|HUSKY\\.BOYS|BOYS-Suit|BOYS_2BV', c: 'Boys' },
  { p: 'TUX|Tuxedo|Adj\\.2B|Adj\\.EuroSlim|SHAWL\\.TUX|TAIL|\\+Vest\\b|\\bSuit\\b', c: 'Suit' },
  { p: '2BV|3BV|1BV|1BP|DB[\\._\\-]|Euro|Portly|Peak.Lapel|Walton|Manchester|NoP|Slim|Savvy|Arlan|Semi-Slim|Notch|DB-Suit', c: 'Suit' }
];

/** Apply memory (user-confirmed overrides) then DEFAULT_RULES. */
export function classifyModel(
  model: string,
  memory: Record<string, RawCategory>,
  rules: ClassifyRule[] = DEFAULT_RULES
): RawCategory {
  const cached = memory[model];
  if (cached) return cached;
  for (const r of rules) {
    try {
      if (new RegExp(r.p, 'i').test(model)) return r.c;
    } catch {
      /* bad user regex — skip */
    }
  }
  return '__UNCLASSIFIED__';
}

/** Choose a size system for a model descriptor. Matches the Round 3 baseline:
 *  only rental-vests (any Rental+Vest pairing, plus Roland.Vest) use vest_xs;
 *  plain "Vest" falls through to standard numeric suit sizing. */
export function getSizeSystem(m: string): SizeSystem {
  if (/BOYS\+|HUSKY\.BOYS|BOYS\.2BV|BOYS-Suit|Rental\.BOYS-Jacket/i.test(m)) return 'boys_numeric';
  if (/Rental\.BOYS-Vest|BOYS_2BV\.Jacket/i.test(m)) return 'boys_bxs';
  if (/Rental BOYS\.Pants|boys.*pants/i.test(m)) return 'boys_pants';
  if (/BOYS.*PANT|^BOYS-Pants/i.test(m)) return 'boys_tpants';
  if (/rental.*vest|vest.*rental|Roland.?Vest/i.test(m)) return 'vest_xs';
  if (/\bshirt\b|linen.shirt|LayDown|FrenchCuff|Linen-Shirt|Clean$|Slim-Fit$/i.test(m)) return 'shirt';
  if (/jean|jeans|shorts/i.test(m)) return 'jeans';
  return 'standard';
}
