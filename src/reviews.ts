import type { Product, Store } from './model';

export interface Review {
  id?: string;
  rating: number;
  text: string;
  date?: string;
  verified?: boolean;
}

export interface Complaint { label: string; mentions: number; example: string }
export interface ReviewAnalysis {
  sampled: number;
  critical: number;
  positive: number;
  pros: Complaint[];
  complaints: Complaint[];
  incentiveMentions: { count: number; example: string };
  signals: string[];
  status: 'insufficient' | 'clear' | 'caution';
}

const selectors: Record<Store, { card: string; body: string; rating: string; date: string; verified: string }> = {
  amazon: { card: '[data-hook="review"]', body: '[data-hook="review-body"]', rating: '[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]', date: '[data-hook="review-date"]', verified: '[data-hook="avp-badge"]' },
  bestbuy: { card: '[data-testid="review-card"], .review-item', body: '[data-testid="review-body"], .ugc-review-body', rating: '[data-testid="review-rating"], .ugc-review-rating', date: 'time, [data-testid="review-date"]', verified: '[data-testid="verified-purchase"], .verified-purchaser' },
  ebay: { card: '.ebay-review-section, [data-testid="review-card"]', body: '.review-item-content, [data-testid="review-body"]', rating: '[aria-label*="out of 5"], [data-testid="review-rating"]', date: 'time', verified: '.verified-purchase, [data-testid="verified-purchase"]' },
};

function rating(value?: string): number | undefined {
  const match = value?.match(/(?:^|\D)([1-5](?:\.\d)?)(?:\s*(?:out of|\/|stars?))?/i);
  if (!match) return undefined;
  const result = Number(match[1]);
  return result >= 1 && result <= 5 ? result : undefined;
}

function date(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value.replace(/^.*?\bon\s+(?=[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined;
}

function text(value?: string): string | undefined {
  const clean = value?.replace(/\s+/g, ' ').trim();
  return clean && clean.length >= 20 ? clean.slice(0, 2000) : undefined;
}

function schemaReviews(doc: Document): Review[] {
  const output: Review[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
    if (types.some(type => typeof type === 'string' && /(^|\/)Review$/i.test(type))) {
      const reviewRating = item.reviewRating as Record<string, unknown> | undefined;
      const score = rating(String(reviewRating?.ratingValue || ''));
      const body = text(String(item.reviewBody || ''));
      if (score && body) output.push({ rating: score, text: body, date: date(String(item.datePublished || '')) });
    }
    for (const key of ['@graph', 'review', 'mainEntity']) if (item[key]) visit(item[key]);
  };
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try { visit(JSON.parse(script.textContent || '')); } catch { /* Invalid metadata is common. */ }
  });
  return output;
}

export function extractReviews(doc: Document, store: Store): Review[] {
  const config = selectors[store];
  const found: Review[] = [];
  doc.querySelectorAll(config.card).forEach(card => {
    const scoreNode = card.querySelector(config.rating);
    const score = rating(scoreNode?.getAttribute('aria-label') || scoreNode?.textContent || undefined);
    const body = text(card.querySelector(config.body)?.textContent || undefined);
    if (!score || !body) return;
    const dateNode = card.querySelector(config.date);
    const dateValue = dateNode?.getAttribute('datetime') || dateNode?.textContent || undefined;
    const verified = card.querySelector(config.verified) ? true : /unverified purchase/i.test(card.textContent || '') ? false : undefined;
    found.push({ id: card.getAttribute('data-review-id') || card.getAttribute('id') || undefined, rating: score, text: body, date: date(dateValue), verified });
  });
  for (const review of schemaReviews(doc)) {
    if (!found.some(item => item.text === review.text)) found.push(review);
  }
  return found;
}

export function mergeReviewPages(existing: Review[], nextPage: Review[]): Review[] {
  const key = (review: Review) => review.id ? `id:${review.id}` : `text:${review.rating}|${review.date || ''}|${review.text.toLowerCase().replace(/\s+/g, ' ')}`;
  const present = new Set(existing.map(key));
  const added: Review[] = [];
  for (const review of nextPage) {
    const identity = key(review);
    if (present.has(identity)) continue;
    present.add(identity);
    added.push(review);
  }
  return [...existing, ...added];
}

const issues = [
  { label: 'Product failure or defects', pattern: /\b(?:die|dies|died|dead|stopped working|quit working|doesn['’]?t work|won['’]?t work|defective|broken|bricked|malfunction\w*|failed after\s+\w+)\b/i },
  { label: 'Function or performance', pattern: /\b(?:lag\w*|unresponsive|throttl\w*|poor performance|slow performance|speed drop\w*|low (?:read|write) speed|buttons? (?:stick|fail)|not function\w*)\b/i },
  { label: 'Setup or compatibility', pattern: /\b(?:firmware|software|driver|install\w*|compatib\w*|bios|setup|set up|connect\w*|pair\w*|recogniz\w*|instructions?|controls?)\b/i },
  { label: 'Comfort or fit', pattern: /\b(?:pain|headache\w*|numbness|uncomfortable|too (?:firm|soft|high|low|small|large|tight)|so small|doesn['’]?t fit|won['’]?t fit|fit poorly)\b/i },
  { label: 'Temperature', pattern: /\b(?:overheat\w*|too hot|too cold|doesn['’]?t cool|not cooling|runs hot)\b/i },
  { label: 'Build or durability', pattern: /\b(?:quality|durab\w*|crack\w*|leak\w*|fell apart|lost (?:its|the) shape|stitch\w*|wore out)\b/i },
  { label: 'Warranty or support', pattern: /\b(?:warranty|refund|return policy|customer service|seller support|replacement|rma)\b/i },
  { label: 'Shipping or condition', pattern: /\b(?:arrived|delivery|shipping|packag\w*|damag\w*|used item|opened box|missing parts)\b/i },
  { label: 'Value or listing accuracy', pattern: /\b(?:worth|price|cost|overpriced|too expensive|wrong capacity|not as described|misleading|counterfeit|fake product|wrong item)\b/i },
] as const;
const negative = /\b(?:not|no|none|neither|never|unable|\w+n['’]?t|die|dies|failed|failure|died|dead|stopped|broken|defective|unreliable|issue|problem|bad|poor|awful|terrible|worse|pain|headache\w*|numbness|too (?:firm|soft|high|low|small|large|tight)|so small|disappoint\w*|difficult|impossible|missing|wrong|slow|overheat\w*|corrupt\w*|refund|denied|refused|ignored|annoy\w*|crash\w*)\b/i;
const positive = /\b(?:good|great|excellent|fast|easy|simple|nice|reliable|stable|smooth|comfortable|supportive|cool|creamy|delicious|relieved|impress\w*|love|perfect|works? well|works? great|worth|recommend\w*|happy|pleased|beautiful|quiet)\b/i;
const merits = [
  { label: 'Function or performance', pattern: /\b(?:speed|performance|responsive|bandwidth|throughput|load times?|frequency|function\w*|buttons?)\b/i },
  { label: 'Ease of use or setup', pattern: /\b(?:install\w*|setup|set up|plug.and.play|configure|firmware|easy to use|easy to clean|assemble|instructions?)\b/i },
  { label: 'Reliability', pattern: /\b(?:reliable|stable|works? well|works? great|no issues?|consistent)\b/i },
  { label: 'Compatibility', pattern: /\b(?:compatib\w*|works? with|expo|xmp|recognized)\b/i },
  { label: 'Comfort or fit', pattern: /\b(?:comfort\w*|support\w*|fit\w*|ergonomic|pain relief|sleep quality|soft|firm)\b/i },
  { label: 'Cooling or temperature', pattern: /\b(?:cooling|stays? cool|keeps? (?:me|it|you) cool|cool to (?:the )?touch|temperature|warm|heat)\b/i },
  { label: 'Taste or texture', pattern: /\b(?:taste|flavor|texture|creamy)\b/i },
  { label: 'Appearance', pattern: /\b(?:look\w*|design|rgb|lighting|aesthetic|color)\b/i },
  { label: 'Value', pattern: /\b(?:value|price|worth|deal|cost)\b/i },
] as const;

function clauses(value: string): string[] {
  return value.split(/(?<=[.!?])\s+|(?<=[.!?])(?=[A-Z])|[,;•°]\s*|\s+(?:and|but|instead of)\s+/i).map(part => part.trim()).filter(Boolean);
}

function concise(value: string): string { return value.length <= 150 ? value : `${value.slice(0, 147).trimEnd()}…`; }

function evidence(value: string, pattern: RegExp): string {
  if (value.length <= 150) return value;
  const hit = Math.max(0, value.search(pattern));
  const start = Math.max(0, hit - 35);
  const end = Math.min(value.length, start + 145);
  return `${start ? '…' : ''}${value.slice(start, end).trim()}${end < value.length ? '…' : ''}`;
}

function hypothetical(value: string): boolean { return /^(?:if|when|assuming|provided that)\b|\b(?:would have to|would need to|rather (?:buy|purchase)|wish|hope)\b/i.test(value.trim()); }
function olderProductComparison(value: string): boolean { return /\b(?:old|previous|prior|former)\b/i.test(value) && /\b(?:unlike|compared|like I did|than my)\b/i.test(value); }

function complaintsFrom(reviews: Review[]): Complaint[] {
  return issues.map(issue => {
    let mentions = 0;
    let example = '';
    for (const review of reviews) {
      const match = clauses(review.text).find(part => issue.pattern.test(part) && (negative.test(part) || /\bcons\s*:/i.test(part)) && !olderProductComparison(part) && !(issue.label === 'Product failure or defects' && /\bdead (?:spot|zone)\b/i.test(part)) && !(issue.label === 'Value or listing accuracy' && (/\b(?:worth\s+(?:one|1|a)\s+star|pay(?:ing)? the price|at this price point|for its current price)\b/i.test(part))));
      if (!match) continue;
      mentions++;
      if (!example) example = evidence(match, issue.pattern);
    }
    return { label: issue.label, mentions, example };
  }).filter(item => item.mentions > 0).sort((a, b) => b.mentions - a.mentions).slice(0, 3);
}

function prosFrom(reviews: Review[]): Complaint[] {
  return merits.map(merit => {
    let mentions = 0;
    let example = '';
    for (const review of reviews) {
      const match = clauses(review.text).find(part => merit.pattern.test(part) && (positive.test(part) || /\bpros\s*:/i.test(part)) && !negative.test(part) && !hypothetical(part));
      if (!match) continue;
      mentions++;
      if (!example) example = evidence(match, merit.pattern);
    }
    return { label: merit.label, mentions, example };
  }).filter(item => item.mentions > 0).sort((a, b) => b.mentions - a.mentions).slice(0, 3);
}

function incentivesFrom(reviews: Review[]): { count: number; example: string } {
  const incentive = /\b(?:gift\s?card|coupon|discount|refund|rebate|free product|free item|cash|payment|paid|incentiv\w*)\b/i;
  const reviewTerms = /\b(?:review|rating|five.star|5.star|positive feedback|star review)\b/i;
  let count = 0;
  let example = '';
  for (const review of reviews) {
    if (/\bvine\b/i.test(review.text) && !/\b(?:seller|gift\s?card|refund|rebate|cash|payment)\b/i.test(review.text)) continue;
    const match = clauses(review.text).find(part => incentive.test(part) && reviewTerms.test(part));
    if (!match) continue;
    count++;
    if (!example) example = concise(match);
  }
  return { count, example };
}

export function analyzeReviews(reviews: Review[], options: { ratingCount?: number; targeted?: boolean } = {}): ReviewAnalysis {
  const critical = reviews.filter(review => review.rating <= 3);
  const complaints = complaintsFrom(reviews);
  const pros = prosFrom(reviews);
  const incentiveMentions = incentivesFrom(reviews);
  const signals: string[] = [];
  if (reviews.length >= 10) {
    const dated = reviews.filter(review => review.date);
    const counts = new Map<string, number>();
    dated.forEach(review => counts.set(review.date!, (counts.get(review.date!) || 0) + 1));
    if (dated.length >= 8 && Math.max(0, ...counts.values()) >= 6 && Math.max(0, ...counts.values()) / dated.length >= 0.6) signals.push('Many sampled reviews share one date');
    const known = reviews.filter(review => review.verified !== undefined);
    if (known.length >= 5 && known.filter(review => review.verified === false).length / known.length >= 0.5) signals.push('At least half of known purchases are unverified');
    const repeated = new Map<string, number>();
    reviews.forEach(review => {
      const key = review.text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 160);
      repeated.set(key, (repeated.get(key) || 0) + 1);
    });
    if (Math.max(0, ...repeated.values()) >= 3) signals.push('Repeated review wording in the sample');
    const verified = known.filter(review => review.verified);
    const unverified = known.filter(review => review.verified === false);
    if (verified.length >= 3 && unverified.length >= 3) {
      const average = (items: Review[]) => items.reduce((sum, item) => sum + item.rating, 0) / items.length;
      if (average(unverified) - average(verified) >= 1.5) signals.push('Unverified ratings are much higher than verified ratings');
    }
  }
  const limited = reviews.length < 30 || !!options.targeted || (options.ratingCount !== undefined && options.ratingCount > reviews.length * 10);
  return { sampled: reviews.length, critical: critical.length, positive: reviews.filter(review => review.rating >= 4).length, pros, complaints, incentiveMentions, signals, status: limited ? 'insufficient' : signals.length ? 'caution' : 'clear' };
}

export function reviewPageLink(doc: Document, product: Product, baseUrl: URL, visited: string[] = []): string | undefined {
  if (product.store === 'ebay') return undefined;
  const links: { url: string; next: boolean }[] = [];
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href*="review"]')) {
    try {
      const url = new URL(anchor.getAttribute('href') || '', baseUrl);
      if (url.origin !== baseUrl.origin || !url.pathname.toLowerCase().includes('review') || !url.pathname.toUpperCase().includes(product.id.toUpperCase()) || visited.includes(url.href)) continue;
      const next = anchor.rel === 'next' || /next/i.test(anchor.textContent || '') || Number(url.searchParams.get('pageNumber') || url.searchParams.get('page') || 0) > 1;
      links.push({ url: url.href, next });
    } catch { /* Ignore malformed links. */ }
  }
  return (visited.length ? links.find(link => link.next) : links[0])?.url;
}
