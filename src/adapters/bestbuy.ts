export const bestbuy = {
  store: 'bestbuy' as const,
  host: /(^|\.)bestbuy\.com$/,
  path: /\/site\/(?:[^?#]*\/)?(\d{5,})\.p(?:\/|$)|\/product\/(?:[^?#]*\/)?sku\/(\d{5,})(?:\/|$)|\/product\/(?:[^?#]*\/)?([A-Z0-9]{10})(?:\/|$)/i,
  title: ['h1', 'meta[property="og:title"]'],
  price: ['[data-testid="customer-price"]', '.priceView-customer-price span'],
  canonical(id: string): string { return `https://www.bestbuy.com/site/${id}.p`; },
};
