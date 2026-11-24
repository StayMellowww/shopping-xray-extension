import type { Product } from './model';
import { compareOffers, canMatchFromTitle, offerSearch, parseEbayApiOffers, parseOfferPage, type Marketplace, type Offer, type SearchLinks } from './offers';
import { readCapturedOffers, registerSearchContext } from './searchCapture';

export type SourceStatus = 'matched' | 'no-match' | 'unreadable' | 'unavailable' | 'not-searched';

export interface OfferLookup {
  offers: Offer[];
  status: Record<Marketplace, SourceStatus>;
  links: SearchLinks;
  ebayApiError?: string;
  ebayApiConnected?: boolean;
}

export async function lookupOffers(product: Product): Promise<OfferLookup> {
  const links = offerSearch(product);
  try { await registerSearchContext(product); } catch { /* Direct searches remain available. */ }
  if (!product.model && !product.gtin && !canMatchFromTitle(product)) return { offers: [], status: { ebay: 'not-searched', bestbuy: 'not-searched' }, links };
  try {
    const response = await chrome.runtime.sendMessage({ type: 'shopping-xray:lookup-offers', product }) as { ebay?: string; bestbuy?: string; ebayApi?: { items?: unknown[]; error?: string } };
    const offers: Offer[] = [];
    const status: Record<Marketplace, SourceStatus> = { ebay: 'unavailable', bestbuy: 'unavailable' };
    for (const source of ['ebay', 'bestbuy'] as const) {
      if (source === 'ebay' && response.ebayApi?.items) {
        const matched = parseEbayApiOffers(response.ebayApi.items, product);
        offers.push(...matched);
        status.ebay = matched.length ? 'matched' : 'no-match';
        continue;
      }
      if (!response[source]) continue;
      const parsed = parseOfferPage(new DOMParser().parseFromString(response[source], 'text/html'), product, source);
      offers.push(...parsed.offers);
      status[source] = parsed.offers.length ? 'matched' : parsed.cardsFound ? 'no-match' : 'unreadable';
    }
    return mergeCapturedOffers({ offers: offers.sort(compareOffers).slice(0, 4), status, links, ebayApiError: response.ebayApi?.error, ebayApiConnected: Array.isArray(response.ebayApi?.items) }, product);
  } catch { return mergeCapturedOffers({ offers: [], status: { ebay: 'unavailable', bestbuy: 'unavailable' }, links }, product); }
}

export async function mergeCapturedOffers(lookup: OfferLookup, product: Product): Promise<OfferLookup> {
  try {
    const captured = await readCapturedOffers(product);
    const byUrl = new Map(lookup.offers.map(offer => [offer.url, offer]));
    const status = { ...lookup.status };
    for (const source of ['ebay', 'bestbuy'] as const) {
      for (const offer of captured[source] || []) if (!byUrl.has(offer.url)) byUrl.set(offer.url, offer);
      if (captured[source]?.length) status[source] = 'matched';
    }
    return { ...lookup, status, offers: [...byUrl.values()].sort(compareOffers).slice(0, 4) };
  } catch { return lookup; }
}
