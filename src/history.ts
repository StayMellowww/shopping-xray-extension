import type { PricePoint, Product } from './model';

const KEY = 'shopping-xray:prices:v1';
type History = Record<string, PricePoint[]>;

export function productKey(product: Product): string {
  return `${product.store}:${product.id}:${product.currency || 'USD'}`;
}

export async function savePrice(product: Product): Promise<PricePoint[]> {
  if (product.store === 'ebay') return [];
  if (product.price === undefined) return loadPrices(product);
  const result = await chrome.storage.local.get(KEY);
  const history: History = result[KEY] || {};
  const key = productKey(product);
  const points = Array.isArray(history[key]) ? history[key] : [];
  const today = new Date().toISOString().slice(0, 10);
  const next = [...points.filter(point => point.at !== today), { at: today, price: product.price }].slice(-90);
  history[key] = next;
  await chrome.storage.local.set({ [KEY]: history });
  return next;
}

export async function loadPrices(product: Product): Promise<PricePoint[]> {
  if (product.store === 'ebay') return [];
  const result = await chrome.storage.local.get(KEY);
  return result[KEY]?.[productKey(product)] || [];
}

export async function removeStoredEbayData(): Promise<void> {
  const oldKeys = ['shopping-xray:captured-offers:v1', 'shopping-xray:captured-offers:v2', 'shopping-xray:search-context:v1'];
  const result = await chrome.storage.local.get([KEY, ...oldKeys]);
  const history: History = result[KEY] || {};
  for (const key of Object.keys(history)) if (key.startsWith('ebay:')) delete history[key];
  await chrome.storage.local.set({ [KEY]: history });
  await chrome.storage.local.remove(oldKeys);
}
