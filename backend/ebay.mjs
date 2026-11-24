import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export function createEbaySearch({ appId, certId, fetchImpl = fetch }) {
  let cached;
  let pending;
  async function getToken() {
    if (cached && cached.until > Date.now()) return cached.value;
    if (pending) return pending;
    pending = (async () => {
      const authorization = Buffer.from(`${appId}:${certId}`).toString('base64');
      const response = await fetchImpl('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }), signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`eBay authentication failed (HTTP ${response.status}).`);
      const json = await response.json();
      if (typeof json.access_token !== 'string' || !Number.isFinite(Number(json.expires_in))) throw new Error('Invalid eBay token response.');
      cached = { value: json.access_token, until: Date.now() + Math.max(0, Number(json.expires_in) - 60) * 1000 };
      return cached.value;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  return async function search(query) {
    if (typeof query !== 'string' || !query.trim() || query.length > 120) throw new Error('Invalid search term.');
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('limit', '50');
    url.searchParams.set('filter', 'conditions:{USED}');
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${await getToken()}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) { if (response.status === 401) cached = undefined; throw new Error(`eBay search failed (HTTP ${response.status}).`); }
    const data = await response.json();
    return (Array.isArray(data.itemSummaries) ? data.itemSummaries : []).slice(0, 50).map(item => {
      const costs = (item.shippingOptions || [])
        .filter(option => option.shippingCostType === 'FIXED' && option.shippingCost?.currency === 'USD' &&
          /^\d+(?:\.\d{1,2})?$/.test(option.shippingCost.value))
        .map(option => Number(option.shippingCost.value));
      return { title: item.title, price: item.price?.value, currency: item.price?.currency, condition: item.condition,
        conditionId: item.conditionId, url: item.itemWebUrl, shipping: costs.length ? Math.min(...costs) : undefined };
    });
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { EBAY_APP_ID: appId, EBAY_CERT_ID: certId } = process.env;
  if (!appId || !certId) { console.error('Set EBAY_APP_ID and EBAY_CERT_ID before starting.'); process.exit(1); }
  const search = createEbaySearch({ appId, certId });
  createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (req.headers.host !== '127.0.0.1:8787' || req.method !== 'GET' || (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) || (req.headers['sec-fetch-site'] === 'cross-site' && !origin) || !['none', 'cross-site', undefined].includes(req.headers['sec-fetch-site'])) { res.writeHead(403).end(JSON.stringify({ error: 'Request not allowed.' })); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    const url = new URL(req.url || '/', 'http://127.0.0.1:8787');
    if (url.pathname !== '/ebay/search') { res.writeHead(404).end(JSON.stringify({ error: 'Not found.' })); return; }
    try { res.end(JSON.stringify({ items: await search(url.searchParams.get('q')) })); }
    catch (error) { res.writeHead(502).end(JSON.stringify({ error: error instanceof Error ? error.message : 'eBay unavailable.' })); }
  }).listen(8787, '127.0.0.1', () => console.log('eBay backend listening on 127.0.0.1:8787.'));
}
