import type { Product, Store } from './model';
import { distinctModel, gtinCodes } from './model';
import { amazon } from './adapters/amazon';
import { bestbuy } from './adapters/bestbuy';
import { ebay } from './adapters/ebay';

type JsonObject = Record<string, unknown>;
const sites = [amazon, bestbuy, ebay];

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
}

function string(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function first(doc: Document, selectors: readonly string[]): string | undefined {
  for (const selector of selectors) {
    const node = doc.querySelector(selector);
    const value = node?.getAttribute('content') || node?.textContent;
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function labeledValue(doc: Document, labels: string[]): string | undefined {
  const wanted = new Set(labels.map(label => label.toLowerCase()));
  for (const keyNode of doc.querySelectorAll('th, dt, li .a-text-bold')) {
    const key = keyNode.textContent?.replace(/[:\s]+$/g, '').trim().toLowerCase();
    if (!key || !wanted.has(key)) continue;
    const row = keyNode.closest('tr, li');
    const valueNode = keyNode.matches('dt') ? keyNode.nextElementSibling : row?.querySelector('td');
    const value = valueNode?.textContent?.trim() || row?.textContent?.replace(keyNode.textContent || '', '').replace(/^[:\s]+/, '').trim();
    if (value && value.length < 100) return value;
  }
  return undefined;
}

function schemaProducts(doc: Document): JsonObject[] {
  const found: JsonObject[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    const item = object(value);
    if (!item) return;
    const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
    if (types.some(type => typeof type === 'string' && /(^|\/)Product$/i.test(type))) found.push(item);
    if (item['@graph']) visit(item['@graph']);
    if (item.mainEntity) visit(item.mainEntity);
  };
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try { visit(JSON.parse(script.textContent || '')); } catch { /* Ignore invalid page metadata. */ }
  });
  return found;
}

function chooseSchemaProduct(items: JsonObject[], id: string, url: URL): JsonObject {
  const selected = items.find(item => [item.sku, item.productID, item.asin, item['@id'], item.url]
    .some(value => {
      const text = string(value);
      if (!text) return false;
      if (text.toUpperCase() === id.toUpperCase()) return true;
      try { return new URL(text, url).pathname.toUpperCase().includes(id.toUpperCase()); } catch { return false; }
    }));
  return selected || (items.length === 1 ? items[0] : {});
}

function cleanTitle(title: string): string {
  return title.replace(/<wbr\s*\/?\s*>/gi, '').replace(/\s+/g, ' ')
    .replace(/\s+[|–-]\s+(Amazon\.com|Best Buy|eBay).*$/i, '')
    .replace(/^(?:20\d{2}\s+)?(?:new\s+)?(?:upgraded|latest)\s+(?:version|model)\s*[,!:-]?\s*/i, '')
    .trim();
}

function amazonBylineBrand(doc: Document): string | undefined {
  const byline = first(doc, ['#bylineInfo']);
  const match = byline?.match(/^(?:Visit the\s+)?(.+?)\s+Store$|^Brand:\s*(.+)$/i);
  return match?.[1]?.trim() || match?.[2]?.trim() || undefined;
}

function priceFromText(value?: string): number | undefined {
  if (value && /\b(?:from|starting at|to)\b|\d\s*[-–]\s*[$£€]?\s*\d/i.test(value)) return undefined;
  const match = value?.replace(/,/g, '').match(/(?:[$£€]\s*)?(\d+(?:\.\d{2})?)/);
  return match ? number(match[1]) : undefined;
}

function priceOffer(product: JsonObject, url: URL): JsonObject {
  const offers = Array.isArray(product.offers) ? product.offers.map(object).filter((item): item is JsonObject => !!item) : [object(product.offers)].filter((item): item is JsonObject => !!item);
  return offers.find(item => string(item.url)?.includes(url.pathname)) || offers.find(item => item.price !== undefined) || offers[0] || {};
}

export function detectStore(url: URL): { store: Store; id: string; canonicalUrl: string } | undefined {
  for (const site of sites) {
    if (!site.host.test(url.hostname.toLowerCase())) continue;
    const match = url.pathname.match(site.path);
    if (!match) return undefined;
    const rawId = match[1] || match[2] || match[3];
    const id = site.store === 'amazon' ? rawId.toUpperCase() : rawId;
    const canonicalUrl = site.store === 'bestbuy' && !/^\d+$/.test(id) ? `${url.origin}${url.pathname}` : site.canonical(id);
    return { store: site.store, id, canonicalUrl };
  }
  return undefined;
}

export function extractProduct(doc: Document, url: URL): Product | undefined {
  const identity = detectStore(url);
  if (!identity) return undefined;
  const site = sites.find(candidate => candidate.store === identity.store)!;
  const data = chooseSchemaProduct(schemaProducts(doc), identity.id, url);
  const offers = priceOffer(data, url);
  const aggregate = object(data.aggregateRating) || {};
  const rawTitle = string(data.name) || first(doc, site.title);
  if (!rawTitle) return undefined;
  const visible = first(doc, site.price);
  const price = priceFromText(visible) ?? number(offers.price) ?? priceFromText(first(doc, ['meta[property="product:price:amount"]', 'meta[itemprop="price"]']));
  const explicitCurrency = visible?.match(/\b(USD|CAD|AUD|NZD|HKD|SGD|EUR|GBP)\b/i)?.[1]
    || (/\b(?:CA|C)\$/i.test(visible || '') ? 'CAD' : /\b(?:AU|A)\$/i.test(visible || '') ? 'AUD' : undefined)
    || (visible?.includes('€') ? 'EUR' : visible?.includes('£') ? 'GBP' : undefined);
  const currency = (explicitCurrency || string(offers.priceCurrency) || first(doc, ['meta[property="product:price:currency"]', 'meta[itemprop="priceCurrency"]']) || 'USD').toUpperCase();
  const brand = string(data.brand) || string(object(data.brand)?.name) || labeledValue(doc, ['brand']) || (identity.store === 'amazon' ? amazonBylineBrand(doc) : undefined);
  const model = [string(data.mpn), string(data.model), labeledValue(doc, ['model', 'model number', 'item model number', 'mpn'])]
    .map(value => distinctModel(value, brand)).find(Boolean);
  const gtin = gtinCodes([data.gtin13, data.gtin12, data.gtin14, data.gtin8, data.gtin, labeledValue(doc, ['upc', 'ean', 'gtin'])].flat().join(' ')).join(', ') || undefined;
  const title = cleanTitle(rawTitle);
  return {
    store: identity.store,
    id: identity.id,
    url: identity.canonicalUrl,
    title,
    searchQuery: model ? [brand, model].filter(Boolean).join(' ') : title,
    brand,
    model,
    sku: string(data.sku) || labeledValue(doc, ['sku', 'sku id']) || (identity.store === 'bestbuy' && /^\d+$/.test(identity.id) ? identity.id : undefined),
    gtin,
    price: price !== undefined && price > 0 ? price : undefined,
    currency,
    rating: number(aggregate.ratingValue),
    ratingCount: number(aggregate.ratingCount),
    reviewCount: number(aggregate.reviewCount),
  };
}
