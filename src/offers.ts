import type { Product } from './model';

export type Marketplace = 'ebay' | 'bestbuy';
export interface Offer {
  marketplace: Marketplace;
  title: string;
  price: number;
  shipping?: number;
  currency: 'USD';
  condition: string;
  url: string;
  savingsPercent?: number;
}

export function compareOffers(a: Offer, b: Offer): number {
  if ((a.shipping === undefined) !== (b.shipping === undefined)) return a.shipping === undefined ? 1 : -1;
  return (a.price + (a.shipping ?? 0)) - (b.price + (b.shipping ?? 0));
}

export interface SearchLinks { amazon: string; ebay: string; bestbuy: string; amazonModel: string; ebayModel: string; bestbuyModel: string }
export interface StoreSearch { store: 'amazon' | 'ebay' | 'bestbuy'; label: string; modelLabel: string; url: string; modelUrl: string }

function broadSearchTerm(product: Product): string {
  const cleaned = product.title
    .replace(/<wbr\s*\/?\s*>/gi, '')
    .replace(/\b(\d+)\s*(?:PK\s*)?[x×]\s*(\d+)\s*(GB|TB)\b/gi, '$1x$2$3')
    .replace(/\bup\s+to\b/gi, ' ')
    .replace(/\bAMD\s+Intel\b|\bAmazon\s+Exclusive\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s.+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ').filter(token => token !== '-' && !/^(?:the|and|with|for|up|to)$/i.test(token));
  return tokens.slice(0, 7).join(' ').slice(0, 100);
}

export function offerSearch(product: Product): SearchLinks {
  const query = broadSearchTerm(product);
  const modelQuery = (product.model ? [product.brand, product.model].filter(Boolean).join(' ') : product.gtin || product.searchQuery).slice(0, 100);
  const makeAmazon = (term: string) => {
    const amazon = new URL('https://www.amazon.com/s');
    amazon.searchParams.set('k', term);
    return amazon.href;
  };
  const makeEbay = (term: string) => {
  const ebay = new URL('https://www.ebay.com/sch/i.html');
    ebay.searchParams.set('_nkw', term);
  ebay.searchParams.set('LH_ItemCondition', '3000');
    return ebay.href;
  };
  const makeBestbuy = (term: string) => {
  const bestbuy = new URL('https://www.bestbuy.com/site/searchpage.jsp');
  bestbuy.searchParams.set('id', 'pcat17071');
    bestbuy.searchParams.set('st', term);
  bestbuy.searchParams.set('qp', 'condition_facet=Condition~Open-Box');
    return bestbuy.href;
  };
  return { amazon: makeAmazon(query), ebay: makeEbay(query), bestbuy: makeBestbuy(query), amazonModel: makeAmazon(modelQuery), ebayModel: makeEbay(modelQuery), bestbuyModel: makeBestbuy(modelQuery) };
}

export function crossStoreSearches(product: Product): StoreSearch[] {
  const links = offerSearch(product);
  const targets: StoreSearch[] = [
    { store: 'amazon', label: 'Search Amazon', modelLabel: 'Amazon model search', url: links.amazon, modelUrl: links.amazonModel },
    { store: 'ebay', label: 'Search eBay used', modelLabel: 'eBay model search', url: links.ebay, modelUrl: links.ebayModel },
    { store: 'bestbuy', label: 'Search Best Buy open-box', modelLabel: 'Best Buy model search', url: links.bestbuy, modelUrl: links.bestbuyModel },
  ];
  return targets.filter(target => target.store !== product.store);
}

function exactPrice(value?: string): number | undefined {
  if (!value || /\bto\b|\bfrom\b|\d\s*[-–]\s*\$?\d/i.test(value)) return undefined;
  const match = value.match(/\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2}))/);
  if (!match) return undefined;
  const price = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function normalized(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, ''); }

function capacity(value: string): string | undefined {
  const match = value.match(/\b\d+(?:\.\d+)?\s*(?:TB|GB)\b/i);
  return match ? normalized(match[0]) : undefined;
}

function speed(value: string): number | undefined {
  const match = value.match(/\b(\d{4,5})\s*(?:MHz|MT\s*\/\s*s)\b/i);
  return match ? Number(match[1]) : undefined;
}

function numberedVariant(value: string): string | undefined {
  const match = value.match(/\b([a-z]*\d+[a-z0-9]*)\s+(pro|evo|lite|plus|max|ultra|mini)\b/i);
  return match ? normalized(match[0]) : undefined;
}

export function canMatchFromTitle(product: Product): boolean {
  return !!product.brand && !!numberedVariant(product.title);
}

function strongMatch(title: string, product: Product): boolean {
  const name = normalized(title);
  const model = product.model && normalized(product.model);
  const baseModel = product.model && normalized(product.model.split('/')[0]);
  const gtin = product.gtin && normalized(product.gtin);
  const expectedCapacity = capacity(product.title);
  const listedCapacity = capacity(title);
  if (expectedCapacity && listedCapacity && expectedCapacity !== listedCapacity) return false;
  const expectedSpeed = speed(product.title);
  const listedSpeed = speed(title);
  if (expectedSpeed && listedSpeed && expectedSpeed !== listedSpeed) return false;
  if (model && model.length >= 4 && name.includes(model)) return true;
  if (baseModel && baseModel.length >= 7 && name.includes(baseModel)) return true;
  if (gtin && gtin.length >= 8 && name.includes(gtin)) return true;
  // Specific part numbers distinguish variants that share the same product name.
  if (model && model.length >= 7 && /\d/.test(model)) return false;
  const variant = numberedVariant(product.title);
  if (variant && !name.includes(variant)) return false;
  if (!product.brand || !name.includes(normalized(product.brand))) return false;
  if (variant) return true;
  const numericTokens = product.title.toLowerCase().match(/\b[a-z]*\d+[a-z0-9]*\b/g) || [];
  const matched = numericTokens.filter(token => token.length >= 3 && name.includes(normalized(token)));
  if (matched.some(token => token.length >= 5)) return true;
  if (matched.length >= 2) return true;
  return false;
}

function isAccessory(title: string): boolean {
  return /\b(for parts|parts only|not working|broken|empty box|box only|no heatsink|without heatsink|(?:no|without|missing)\s+(?:usb\s+)?(?:dongle|receiver|adapter|pedals?|power supply|charger)|(?:mouse|wheel) only|screen protector|replacement (?:case|battery|charger)|protective case|phone case|laptop case|charging cable|power adapter)\b/i.test(title);
}

export function parseEbayApiOffers(items: unknown, product: Product): Offer[] {
  if (!Array.isArray(items)) return [];
  const found = new Map<string, Offer>();
  for (const value of items.slice(0, 50)) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 300) : '';
    const condition = typeof item.condition === 'string' ? item.condition.trim().slice(0, 100) : '';
    const price = Number(item.price);
    if (!title || !condition || !/\b(?:used|pre.owned)\b/i.test(condition) || item.currency !== 'USD' || !Number.isFinite(price) || price <= 0 || !strongMatch(title, product) || isAccessory(title)) continue;
    if (product.price && (price < product.price * 0.3 || price >= product.price)) continue;
    try {
      const url = new URL(String(item.url || ''));
      if (url.protocol !== 'https:' || (url.hostname !== 'ebay.com' && !url.hostname.endsWith('.ebay.com'))) continue;
      const id = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})(?:\/|$)/)?.[1];
      if (!id) continue;
      const canonical = `https://www.ebay.com/itm/${id}`;
      const shipping = typeof item.shipping === 'number' && Number.isFinite(item.shipping) && item.shipping >= 0 ? item.shipping : undefined;
      const total = shipping === undefined ? undefined : price + shipping;
      found.set(canonical, { marketplace: 'ebay', title, price, shipping, currency: 'USD', condition, url: canonical,
        savingsPercent: product.price && total !== undefined && total < product.price ? Math.round((1 - total / product.price) * 100) : undefined });
    } catch { /* Ignore invalid marketplace links. */ }
  }
  return [...found.values()].sort(compareOffers).slice(0, 3);
}

function offerFromCard(card: Element, product: Product, marketplace: Marketplace): Offer | undefined {
  const titleNode = marketplace === 'ebay'
    ? card.querySelector('.s-item__title, .s-card__title, .su-card-container__header, [data-testid="item-title"]')
    : card.querySelector('h4.sku-title, [data-testid="product-title"], .sku-title, h4');
  const priceNode = marketplace === 'ebay'
    ? card.querySelector('.s-item__price, .s-card__price, [data-testid="item-price"]')
    : card.querySelector('.priceView-customer-price, [data-testid="customer-price"]');
  const link = card.querySelector<HTMLAnchorElement>(marketplace === 'ebay' ? 'a.s-item__link, a[href*="/itm/"]' : 'a[href*="/product/"], a[href*="/site/"]');
  const title = titleNode?.textContent?.replace(/<wbr\s*\/?\s*>/gi, '').replace(/Opens in a new window or tab/gi, '').replace(/Pre-Owned\s*$/i, '').replace(/\s+/g, ' ').trim();
  const price = exactPrice(priceNode?.textContent || undefined);
  if (marketplace === 'ebay' && /\b\d+\s+bids?\b|\btime left\b/i.test(card.textContent || '')) return undefined;
  if (!title || !price || !link || !strongMatch(title, product) || isAccessory(title)) return undefined;
  if (product.price && (price < product.price * 0.3 || price >= product.price)) return undefined;
  let url: URL;
  try { url = new URL(link.getAttribute('href') || '', marketplace === 'ebay' ? 'https://www.ebay.com' : 'https://www.bestbuy.com'); } catch { return undefined; }
  const domain = marketplace === 'ebay' ? 'ebay.com' : 'bestbuy.com';
  if (url.protocol !== 'https:' || (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`))) return undefined;
  if (marketplace === 'ebay' && !url.pathname.includes('/itm/')) return undefined;
  if (marketplace === 'ebay') {
    const itemId = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})(?:\/|$)/)?.[1];
    if (!itemId) return undefined;
    url = new URL(`https://www.ebay.com/itm/${itemId}`);
  }
  if (marketplace === 'bestbuy' && !/\/(?:product|site)\//.test(url.pathname)) return undefined;
  if (marketplace === 'bestbuy' && !/open.box/i.test(card.textContent || '') && !url.pathname.includes('/openbox')) return undefined;
  const conditionText = marketplace === 'ebay' ? card.querySelector('.SECONDARY_INFO, .s-item__subtitle, .s-card__subtitle')?.textContent?.trim() : card.textContent?.match(/Open.Box\s*(?:Excellent|Good|Fair)?/i)?.[0];
  return {
    marketplace,
    title,
    price,
    currency: 'USD',
    condition: conditionText || (marketplace === 'ebay' ? 'Used search result' : 'Open box'),
    url: url.href,
  };
}

export function parseOfferPage(doc: Document, product: Product, marketplace: Marketplace): { offers: Offer[]; cardsFound: number } {
  const selector = marketplace === 'ebay' ? 'li.s-item, li.s-card, .su-card-container, [data-testid="item-card"]' : 'li.sku-item, .shop-sku-list-item, [data-testid="product-listing"]';
  const cards = doc.querySelectorAll(selector);
  const byUrl = new Map<string, Offer>();
  cards.forEach(card => {
    const offer = offerFromCard(card, product, marketplace);
    if (offer && !byUrl.has(offer.url)) byUrl.set(offer.url, offer);
  });
  return { offers: [...byUrl.values()].sort(compareOffers).slice(0, 3), cardsFound: cards.length };
}

export function parseOffers(doc: Document, product: Product, marketplace: Marketplace): Offer[] {
  return parseOfferPage(doc, product, marketplace).offers;
}
