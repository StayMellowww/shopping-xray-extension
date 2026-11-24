export type Store = 'amazon' | 'bestbuy' | 'ebay';

export interface Product {
  store: Store;
  id: string;
  url: string;
  title: string;
  searchQuery: string;
  brand?: string;
  model?: string;
  sku?: string;
  gtin?: string;
  price?: number;
  currency?: string;
  rating?: number;
  ratingCount?: number;
  reviewCount?: number;
}

export function gtinCodes(value?: string): string[] {
  return [...new Set(value?.match(/\b(?:\d{8}|\d{12,14})\b/g) || [])];
}

export function distinctModel(model?: string, brand?: string): string | undefined {
  const clean = (value?: string) => value?.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return clean(model) && clean(model) !== clean(brand) ? model : undefined;
}

export interface PricePoint {
  at: string;
  price: number;
}
