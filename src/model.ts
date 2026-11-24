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
}

export interface PricePoint {
  at: string;
  price: number;
}
