import type { Product } from './model';
import { offerSearch, parseOfferPage, type Marketplace, type Offer } from './offers';

const CONTEXT_KEY = 'shopping-xray:search-context:v1';
export const CAPTURE_KEY = 'shopping-xray:captured-offers:v5';

interface Context { query: string; source: Marketplace; product: Product; at: number }
interface Capture { offers: Offer[]; at: number }

async function ensureSession(): Promise<void> {
  const result = await chrome.runtime.sendMessage({ type: 'shopping-xray:session-ready' }) as { ok?: boolean };
  if (!result?.ok) throw new Error('Session storage unavailable');
}

function key(product: Product): string { return `${product.store}:${product.id}`; }
function query(url: URL): string | undefined {
  if (/(^|\.)ebay\.com$/.test(url.hostname) && url.pathname === '/sch/i.html' && url.searchParams.get('LH_ItemCondition') === '3000') return url.searchParams.get('_nkw') || undefined;
  if (/(^|\.)bestbuy\.com$/.test(url.hostname) && url.pathname === '/site/searchpage.jsp' && url.searchParams.get('qp')?.includes('Open-Box')) return url.searchParams.get('st') || undefined;
  return undefined;
}

export function isSearchPage(url: URL): boolean { return !!query(url); }

export async function registerSearchContext(product: Product): Promise<void> {
  await ensureSession();
  const links = offerSearch(product);
  const now = Date.now();
  const entries: Context[] = [
    { query: new URL(links.ebay).searchParams.get('_nkw') || '', source: 'ebay', product, at: now },
    { query: new URL(links.ebayModel).searchParams.get('_nkw') || '', source: 'ebay', product, at: now },
    { query: new URL(links.bestbuy).searchParams.get('st') || '', source: 'bestbuy', product, at: now },
    { query: new URL(links.bestbuyModel).searchParams.get('st') || '', source: 'bestbuy', product, at: now },
  ];
  const result = await chrome.storage.session.get(CONTEXT_KEY);
  const previous: Context[] = Array.isArray(result[CONTEXT_KEY]) ? result[CONTEXT_KEY] : [];
  const old = previous.filter(item => now - item.at < 86_400_000 && item.product && key(item.product) !== key(product));
  await chrome.storage.session.set({ [CONTEXT_KEY]: [...entries, ...old].slice(0, 20) });
}

export async function captureSearchPage(doc: Document, url: URL): Promise<boolean> {
  const search = query(url);
  if (!search) return false;
  await ensureSession();
  const source: Marketplace = url.hostname.endsWith('ebay.com') ? 'ebay' : 'bestbuy';
  const result = await chrome.storage.session.get(CONTEXT_KEY);
  const contexts: Context[] = Array.isArray(result[CONTEXT_KEY]) ? result[CONTEXT_KEY] : [];
  const context = contexts.find(item => item.source === source && item.query.toLowerCase() === search.toLowerCase() && Date.now() - item.at < 86_400_000);
  if (!context) return false;
  const parsed = parseOfferPage(doc, context.product, source);
  if (!parsed.offers.length) return false;
  const stored = await chrome.storage.session.get(CAPTURE_KEY);
  const captures: Record<string, Partial<Record<Marketplace, Capture>>> = stored[CAPTURE_KEY] || {};
  captures[key(context.product)] = { ...(captures[key(context.product)] || {}), [source]: { offers: parsed.offers, at: Date.now() } };
  const recent = Object.entries(captures).filter(([, value]) => Object.values(value).some(item => item && Date.now() - item.at < 30 * 60_000)).slice(-20);
  await chrome.storage.session.set({ [CAPTURE_KEY]: Object.fromEntries(recent) });
  return true;
}

export async function readCapturedOffers(product: Product): Promise<Partial<Record<Marketplace, Offer[]>>> {
  await ensureSession();
  const result = await chrome.storage.session.get(CAPTURE_KEY);
  const captures: Record<string, Partial<Record<Marketplace, Capture>>> = result[CAPTURE_KEY] || {};
  const found = captures[key(product)] || {};
  const fresh = (source: Marketplace) => found[source] && Date.now() - found[source]!.at < 30 * 60_000 ? found[source]!.offers : undefined;
  return { ebay: fresh('ebay'), bestbuy: fresh('bestbuy') };
}
