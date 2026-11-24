export const amazon = {
  store: 'amazon' as const,
  host: /(^|\.)amazon\.com$/,
  path: /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i,
  title: ['#productTitle', 'meta[property="og:title"]'],
  price: ['#corePrice_feature_div .a-price .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice'],
  canonical(id: string): string { return `https://www.amazon.com/dp/${id.toUpperCase()}`; },
};
