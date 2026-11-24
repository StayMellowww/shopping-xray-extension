import { describe, expect, it } from 'vitest';
import { detectStore, extractProduct } from './adapters';

function page(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('product extraction', () => {
  it('uses the visible variant price, keeps the two retailer totals, and ignores aggregate-only prices', () => {
    const html = '<h1>Widget</h1><script type="application/ld+json">{"@type":"Product","name":"Widget","offers":{"lowPrice":"15","priceCurrency":"USD"},"aggregateRating":{"reviewCount":50,"ratingCount":90}}</script>';
    const url = new URL('https://www.bestbuy.com/site/widget/1234567.p');
    expect(extractProduct(page(html), url)?.price).toBeUndefined();
    expect(extractProduct(page(html + '<div data-testid="customer-price">EUR 49.99</div>'), url))
      .toMatchObject({ price: 49.99, currency: 'EUR', reviewCount: 50, ratingCount: 90 });
  });
  it('reads Amazon JSON-LD including graph metadata', () => {
    const doc = page(`<script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"},{"@type":"Product","name":"Widget Pro | Amazon.com","brand":{"name":"Acme"},"mpn":"WP-1","gtin12":"123456789012","offers":{"price":"49.99","priceCurrency":"USD"},"aggregateRating":{"ratingValue":"4.2","reviewCount":"87"}}]}</script>`);
    expect(extractProduct(doc, new URL('https://www.amazon.com/Widget/dp/B012345678?th=1'))).toMatchObject({
      store: 'amazon', id: 'B012345678', title: 'Widget Pro', brand: 'Acme', model: 'WP-1', gtin: '123456789012', price: 49.99, rating: 4.2, reviewCount: 87, ratingCount: undefined,
    });
  });

  it('reads Amazon storefront byline as a brand when structured data omits it', () => {
    const doc = page('<h1 id="productTitle">GameSir X5 Lite Mobile Gaming Controller</h1><a id="bylineInfo">Visit the GameSir Store</a>');
    expect(extractProduct(doc, new URL('https://www.amazon.com/dp/B0DXPMVCWC'))).toMatchObject({ brand: 'GameSir' });
  });

  it('uses a Best Buy page fallback when structured data is absent', () => {
    const doc = page('<h1>Widget Pro</h1><div data-testid="customer-price">$1,299.99</div>');
    expect(extractProduct(doc, new URL('https://www.bestbuy.com/site/widget/1234567.p?skuId=1234567'))).toMatchObject({ store: 'bestbuy', id: '1234567', price: 1299.99 });
  });

  it('recognizes current Best Buy product URLs', () => {
    expect(detectStore(new URL('https://www.bestbuy.com/product/widget/JJ123/sku/6672160/openbox?condition=good'))?.id).toBe('6672160');
    const current = new URL('https://www.bestbuy.com/product/corsair-vengeance-rgb-32gb-2x16gb-ddr5-6000mhz-c36-amd-expo-intel-xmp-udimm-desktop-memory-gray/J39QHTC9S2');
    expect(detectStore(current)).toMatchObject({ store: 'bestbuy', id: 'J39QHTC9S2', canonicalUrl: current.href });
    expect(extractProduct(page('<h1>CORSAIR VENGEANCE RGB 32GB DDR5</h1><div data-testid="customer-price">$597.99</div>'), current)).toMatchObject({ store: 'bestbuy', id: 'J39QHTC9S2', price: 597.99 });
  });

  it('recognizes eBay item pages and rejects search pages', () => {
    expect(detectStore(new URL('https://www.ebay.com/itm/Some-item/123456789012'))?.id).toBe('123456789012');
    expect(detectStore(new URL('https://www.ebay.com/sch/i.html?_nkw=widget'))).toBeUndefined();
  });

  it('selects the structured product matching the active item', () => {
    const doc = page(`<script type="application/ld+json">[
      {"@type":"Product","sku":"OTHER","name":"Wrong item","offers":{"price":"12.00"}},
      {"@type":"Product","sku":"1234567","name":"2026 Upgraded Version, Widget Pro","brand":"Acme","mpn":"WP-1","offers":[{"price":"49.99","priceCurrency":"USD"}]}
    ]</script>`);
    expect(extractProduct(doc, new URL('https://www.bestbuy.com/site/widget/1234567.p'))).toMatchObject({ title: 'Widget Pro', price: 49.99, sku: '1234567', searchQuery: 'Acme WP-1' });
  });

  it('falls back to labeled specifications on an eBay item', () => {
    const doc = page('<h1>Acme Camera</h1><dl><dt>Brand</dt><dd>Acme</dd><dt>Model</dt><dd>AX-5</dd><dt>UPC</dt><dd>123456789012</dd></dl><div class="x-price-primary"><span>$89.00</span></div>');
    expect(extractProduct(doc, new URL('https://www.ebay.com/itm/123456789012'))).toMatchObject({ brand: 'Acme', model: 'AX-5', gtin: '123456789012', price: 89, searchQuery: 'Acme AX-5' });
  });

  it('removes literal eBay word break markup from product titles', () => {
    const doc = page('<h1>Corsair RAM CMK32GX5M2B560&lt;wbr/&gt;0C36</h1>');
    expect(extractProduct(doc, new URL('https://www.ebay.com/itm/123456789012'))?.title).toBe('Corsair RAM CMK32GX5M2B5600C36');
  });

  it('does not borrow data from an unmatched product in a multi-product page', () => {
    const doc = page('<h1>Actual item</h1><script type="application/ld+json">[{"@type":"Product","sku":"1111111","name":"Other one","offers":{"price":"10.00"}},{"@type":"Product","sku":"2222222","name":"Other two","offers":{"price":"20.00"}}]</script>');
    expect(extractProduct(doc, new URL('https://www.bestbuy.com/site/actual/3333333.p'))).toMatchObject({ title: 'Actual item', price: undefined });
  });
});
