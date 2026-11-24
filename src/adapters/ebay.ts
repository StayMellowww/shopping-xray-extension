export const ebay = {
  store: 'ebay' as const,
  host: /(^|\.)ebay\.com$/,
  path: /\/itm\/(?:[^/]+\/)?(\d{9,15})(?:\/|$)/i,
  title: ['h1.x-item-title__mainTitle', 'h1', 'meta[property="og:title"]'],
  price: ['[data-testid="x-price-primary"]', '.x-price-primary span'],
  canonical(id: string): string { return `https://www.ebay.com/itm/${id}`; },
};
