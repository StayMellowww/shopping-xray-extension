import { afterEach, expect, it, vi } from 'vitest';
import { removeStoredEbayData, savePrice } from './history';
import type { Product } from './model';

afterEach(() => vi.unstubAllGlobals());

it('removes old eBay snapshots and captured offers while retaining other price history', async () => {
  const data: Record<string, unknown> = {
    'shopping-xray:prices:v1': { 'ebay:123:USD': [{ at: '2026-01-01', price: 10 }], 'amazon:B012345678:USD': [{ at: '2026-01-01', price: 20 }] },
    'shopping-xray:captured-offers:v2': { old: true },
  };
  const local = { get: vi.fn(async () => ({ ...data })), set: vi.fn(async (values: Record<string, unknown>) => Object.assign(data, values)), remove: vi.fn(async (keys: string[]) => keys.forEach(key => delete data[key])) };
  vi.stubGlobal('chrome', { storage: { local } });
  await removeStoredEbayData();
  expect(data['shopping-xray:prices:v1']).toEqual({ 'amazon:B012345678:USD': [{ at: '2026-01-01', price: 20 }] });
  expect(data['shopping-xray:captured-offers:v2']).toBeUndefined();
  const product: Product = { store: 'ebay', id: '123', url: 'https://www.ebay.com/itm/123', title: 'Test', searchQuery: 'Test', price: 10 };
  local.set.mockClear();
  expect(await savePrice(product)).toEqual([]);
  expect(local.set).not.toHaveBeenCalled();
});
