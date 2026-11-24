import { detectStore } from './adapters';
import { canMatchFromTitle, offerSearch } from './offers';
import type { Product } from './model';
import { removeStoredEbayData } from './history';

const sessionReady = chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
void chrome.storage.session.remove(['shopping-xray:captured-offers:v2', 'shopping-xray:captured-offers:v3', 'shopping-xray:captured-offers:v4']);
void removeStoredEbayData().catch(() => {});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (message as { type?: string }).type !== 'shopping-xray:session-ready') return;
  sessionReady.then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
  return true;
});

type FetchRequest = { type: 'shopping-xray:fetch-reviews'; url: string; productId: string };

function allowed(request: FetchRequest, sender: chrome.runtime.MessageSender): boolean {
  if (!sender.url) return false;
  try {
    const source = new URL(sender.url);
    const target = new URL(request.url);
    const product = detectStore(source);
    return !!product && product.id === request.productId && target.origin === source.origin &&
      target.protocol === 'https:' && target.pathname.toLowerCase().includes('review') &&
      target.pathname.toUpperCase().includes(product.id.toUpperCase());
  } catch { return false; }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (message as FetchRequest).type !== 'shopping-xray:fetch-reviews') return;
  const request = message as FetchRequest;
  if (!allowed(request, sender)) {
    sendResponse({ error: 'Review page is outside the active product.' });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  fetch(request.url, { credentials: 'include', signal: controller.signal })
    .then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Review page unavailable');
      const html = await response.text();
      if (html.length > 1_000_000) throw new Error('Review page too large');
      sendResponse({ html });
    })
    .catch(() => sendResponse({ error: 'Review page unavailable' }))
    .finally(() => clearTimeout(timeout));
  return true;
});

async function fetchHtml(url: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { credentials: 'include', signal: controller.signal });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return undefined;
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 4_000_000) return undefined;
    const html = await response.text();
    return html.length <= 4_000_000 ? html : undefined;
  } catch { return undefined; }
  finally { clearTimeout(timeout); }
}

async function fetchEbayApi(query: string): Promise<{ items?: unknown[]; error?: string }> {
  try {
    const url = new URL('http://127.0.0.1:8787/ebay/search');
    url.searchParams.set('q', query.slice(0, 120));
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    return response.ok && Array.isArray(data.items) ? { items: data.items } : { error: typeof data.error === 'string' ? data.error : 'eBay API unavailable.' };
  } catch { return { error: 'Local eBay backend is not running.' }; }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (message as { type?: string }).type !== 'shopping-xray:lookup-offers') return;
  const product = (message as { product?: Product }).product;
  const source = sender.url && detectStore(new URL(sender.url));
  if (!product || !source || source.id !== product.id || source.store !== product.store ||
      typeof product.searchQuery !== 'string' || product.searchQuery.length > 160 ||
      (typeof product.model !== 'string' && typeof product.gtin !== 'string' && !canMatchFromTitle(product))) {
    sendResponse({ error: 'Product lookup unavailable' });
    return;
  }
  const urls = offerSearch(product);
  const query = new URL(urls.ebay).searchParams.get('_nkw') || product.searchQuery;
  Promise.all([fetchEbayApi(query), fetchHtml(urls.bestbuy)])
    .then(async ([ebayApi, bestbuy]) => sendResponse({ ebayApi, ebay: ebayApi.items ? undefined : await fetchHtml(urls.ebay), bestbuy }))
    .catch(() => sendResponse({ error: 'Marketplace search unavailable' }));
  return true;
});
