export interface Promotion { kind: 'coupon' | 'code' | 'deal'; text: string; code?: string }

export function extractPromotions(doc: Document): Promotion[] {
  const selectors = [
    '#couponFeature',
    '#promotions_feature_div',
    '[data-feature-name="couponFeature"]',
    '[data-csa-c-content-id*="coupon"]',
    '[data-testid="coupon"]',
  ];
  const output: Promotion[] = [];
  const seen = new Set<string>();
  for (const node of doc.querySelectorAll(selectors.join(', '))) {
    if (node.closest('[hidden], [aria-hidden="true"]')) continue;
    const value = node.textContent?.replace(/\s+/g, ' ').trim();
    if (!value || !/\b(?:coupon|promo(?:tion)?|claim code|deal|save\s+(?:\$\d+|\d+%))\b/i.test(value)) continue;
    const clean = value.slice(0, 240);
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const candidate = clean.match(/(?:promo(?:tion)?|claim)\s+code\s*[:#-]?\s+([A-Z0-9]{5,12})\b/i)?.[1];
    const code = candidate && candidate === candidate.toUpperCase() ? candidate : undefined;
    output.push({ kind: code ? 'code' : /\bcoupon\b/i.test(clean) ? 'coupon' : 'deal', text: clean, code });
    if (output.length >= 3) break;
  }
  return output;
}
