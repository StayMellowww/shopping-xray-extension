import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEbaySearch } from './ebay.mjs';

test('uses production OAuth and Browse, caches tokens, and strips seller data', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? new Response(JSON.stringify({ access_token: 'temporary', expires_in: 7200 }))
      : new Response(JSON.stringify({ itemSummaries: [{ title: 'Item', price: { value: '20.00', currency: 'USD' }, condition: 'Used', itemWebUrl: 'https://www.ebay.com/itm/123456789012', seller: { username: 'private' } }] }));
  };
  const search = createEbaySearch({ appId: 'app', certId: 'secret', fetchImpl: fakeFetch });
  const result = await search('widget');
  assert.equal(result[0].shipping, undefined);
  await search('second');
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, 'https://api.ebay.com/identity/v1/oauth2/token');
  assert.equal(new URL(calls[1].url).searchParams.get('filter'), 'conditions:{USED}');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer temporary');
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('reports authentication failure without returning credentials', async () => {
  const search = createEbaySearch({ appId: 'app', certId: 'secret', fetchImpl: async () => new Response('', { status: 401 }) });
  await assert.rejects(search('widget'), /authentication failed \(HTTP 401\)/);
});
