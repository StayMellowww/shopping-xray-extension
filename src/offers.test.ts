import { describe, expect, it } from 'vitest';
import { canMatchFromTitle, crossStoreSearches, offerSearch, parseEbayApiOffers, parseOffers } from './offers';
import type { Product } from './model';

const product: Product = { store: 'amazon', id: 'B012345678', url: 'https://www.amazon.com/dp/B012345678', title: 'Sony Headphones', searchQuery: 'Sony WH-1000XM5', brand: 'Sony', model: 'WH-1000XM5', price: 400, currency: 'USD' };
const page = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('marketplace offers', () => {
  it('requires a complete identifier and handles multiple UPCs and brand-only models', () => {
    const listing = (title: string) => ({ title, price: '180.00', currency: 'USD', shipping: 0, condition: 'Used', url: 'https://www.ebay.com/itm/123456789012' });
    const wheel = { ...product, model: '941-000110', gtin: '097855112767 823746002493' };
    for (const id of ['097855112767', '823746002493', '941000110']) {
      expect(parseEbayApiOffers([listing('Wheel ' + id)], wheel)).toHaveLength(1);
    }
    for (const id of ['941-000110B', 'A941-000110', '0097855112767']) {
      expect(parseEbayApiOffers([listing('Wheel ' + id)], wheel)).toHaveLength(0);
    }
    const pillow = { ...product, brand: 'Cozyplayer', model: 'Cozyplayer', title: 'Cozyplayer Pillow', gtin: '780280882694' };
    expect(parseEbayApiOffers([listing('Cozyplayer travel pillow')], pillow)).toHaveLength(0);
    expect(new URL(offerSearch(pillow).ebayModel).searchParams.get('_nkw')).toBe(pillow.gtin);
    expect(parseEbayApiOffers([listing('Wheel 941000110')], { ...wheel, price: 100, currency: 'EUR' })[0]).toMatchObject({ price: 180, savingsPercent: undefined });
  });
  it('ranks quoted shipping totals first and withholds savings for unknown shipping', () => {
    const base = { title: 'Sony WH-1000XM5', currency: 'USD', condition: 'Used' };
    const items = [undefined, 114.21, 0].map((shipping, i) => ({
      ...base, shipping, price: [330, 425, 475][i], url: 'https://www.ebay.com/itm/12345678901' + i,
    }));
    const offers = parseEbayApiOffers(items, { ...product, price: 549 });
    expect(offers.map(offer => offer.price)).toEqual([475, 425, 330]);
    expect(offers.map(offer => offer.savingsPercent)).toEqual([13, 2, undefined]);
  });
  it('rejects listings explicitly missing a wireless receiver', () => {
    const mouse: Product = { ...product, title: 'Logitech G502 LIGHTSPEED Wireless Gaming Mouse', brand: 'Logitech', model: '910-005565', price: 83.95 };
    const item = (title: string, id: string) => ({ title, price: '39.95', currency: 'USD', condition: 'Used', url: `https://www.ebay.com/itm/${id}` });
    expect(parseEbayApiOffers([item('Logitech G502 910-005565 *NO DONGLE*', '147666078292'), item('Logitech G502 910-005565 without USB receiver', '377638324016'), item('Logitech G502 910-005565 with USB receiver', '168535436294')], mouse)).toMatchObject([{ url: 'https://www.ebay.com/itm/168535436294' }]);
  });
  it('rejects wrong monitor and RAM variants and incomplete kits', () => {
    const monitor: Product = { ...product, brand: 'ASUS', title: 'ASUS ROG Strix XG27ACDNG 360Hz 1440P OLED', model: 'XG27ACDNG', price: 549 };
    const item = (title: string, id: string) => ({ title, price: '350.00', currency: 'USD', condition: 'Used', url: `https://www.ebay.com/itm/${id}` });
    expect(parseEbayApiOffers([item('ASUS ROG Strix XG27AQDMG 27in OLED 240Hz 1440p', '147617145614'), item('ASUS ROG Strix XG27ACDNG 27in OLED 360Hz', '178326065261')], monitor)).toMatchObject([{ url: 'https://www.ebay.com/itm/178326065261' }]);
    const ram: Product = { ...product, brand: 'Corsair', title: 'CORSAIR Vengeance RGB DDR5 RAM 32GB 6000MHz CL30', model: 'CMH32GX5M2B6000Z30K', price: 657.99 };
    expect(parseEbayApiOffers([item('NO HEATSINK Corsair DDR5 32GB 6000MHz CL38 CMK32GX5M2B6000Z38', '920116515048'), item('CORSAIR VENGEANCE RGB 32GB DDR5 5200MT/s CMH32GX5M2B5200C40W', '117292249634'), item('Corsair Vengeance RGB DDR5 32GB 6000MT/s', '137919971309')], ram)).toEqual([]);
  });
  it('validates eBay API matches, currencies, condition, links, and duplicates', () => {
    const items = [
      { title: 'Sony WH-1000XM5 headphones', price: '250.00', currency: 'USD', condition: 'Used', url: 'https://www.ebay.com/itm/123456789012?hash=a' },
      { title: 'Sony WH-1000XM5 headphones', price: '250.00', currency: 'USD', condition: 'Used', url: 'https://www.ebay.com/itm/123456789012?hash=b' },
      { title: 'Sony WH-1000XM4 headphones', price: '200.00', currency: 'USD', condition: 'Used', url: 'https://www.ebay.com/itm/123456789013' },
      { title: 'Sony WH-1000XM5 headphones', price: '200.00', currency: 'EUR', condition: 'Used', url: 'https://www.ebay.com/itm/123456789014' },
      { title: 'Sony WH-1000XM5 headphones', price: '200.00', currency: 'USD', condition: 'Used', url: 'https://evil.example/itm/123456789015' },
    ];
    expect(parseEbayApiOffers(items, product)).toMatchObject([{ price: 250, url: 'https://www.ebay.com/itm/123456789012' }]);
    expect(parseEbayApiOffers(items, product)).toHaveLength(1);
  });
  it('builds on-demand used and open-box searches', () => {
    const links = offerSearch(product);
    expect(new URL(links.ebay).searchParams.get('LH_ItemCondition')).toBe('3000');
    expect(new URL(links.ebay).searchParams.get('_nkw')).toContain('Sony Headphones');
    expect(new URL(links.ebayModel).searchParams.get('_nkw')).toBe('Sony WH-1000XM5');
    expect(new URL(links.bestbuy).searchParams.get('qp')).toBe('condition_facet=Condition~Open-Box');
  });

  it('drops marketing filler but keeps the RAM capacity and speed in search links', () => {
    const ram: Product = { ...product, title: 'CORSAIR Vengeance DDR5 32GB (2 x 16GB) Up to 6000MHz AMD Intel RAM', brand: 'CORSAIR', model: 'CMK32GX5M2B6000Z30' };
    const links = offerSearch(ram);
    expect(new URL(links.ebay).searchParams.get('_nkw')).toBe('CORSAIR Vengeance DDR5 32GB 2x16GB 6000MHz RAM');
    expect(new URL(links.bestbuy).searchParams.get('st')).toBe('CORSAIR Vengeance DDR5 32GB 2x16GB 6000MHz RAM');
    expect(new URL(links.ebayModel).searchParams.get('_nkw')).toBe('CORSAIR CMK32GX5M2B6000Z30');
  });

  it('keeps the product type in nontech searches without the marketplace label', () => {
    const maker: Product = { ...product, title: 'Ninja Creami Scoop&Swirl Ice Cream Maker Amazon Exclusive Bone & Champagne', brand: 'Ninja', model: 'NC701IV' };
    expect(new URL(offerSearch(maker).amazon).searchParams.get('k')).toBe('Ninja Creami Scoop Swirl Ice Cream Maker');
    const controller: Product = { ...product, title: 'GameSir X5 Lite Mobile Gaming Controller for Android, Hall Effect Joystick', brand: undefined, model: undefined, gtin: undefined };
    expect(new URL(offerSearch(controller).ebay).searchParams.get('_nkw')).toContain('Controller');
  });

  it('offers the other two stores for every current marketplace', () => {
    expect(crossStoreSearches({ ...product, store: 'amazon' }).map(item => item.store)).toEqual(['ebay', 'bestbuy']);
    expect(crossStoreSearches({ ...product, store: 'ebay' }).map(item => item.store)).toEqual(['amazon', 'bestbuy']);
    expect(crossStoreSearches({ ...product, store: 'bestbuy' }).map(item => item.store)).toEqual(['amazon', 'ebay']);
    expect(new URL(crossStoreSearches({ ...product, store: 'ebay' })[0].url).hostname).toBe('www.amazon.com');
  });

  it('keeps only strongly matched eBay listings above the price floor', () => {
    const doc = page(`<ul>
      <li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/123456789012"><span class="s-item__title">Sony WH1000XM5 headphones, used</span></a><span class="s-item__price">$250.00</span><span class="SECONDARY_INFO">Used</span></li>
      <li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/123456789013"><span class="s-item__title">Sony WH1000XM5 replacement charger</span></a><span class="s-item__price">$180.00</span></li>
      <li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/123456789014"><span class="s-item__title">Sony WH1000XM5 headphones</span></a><span class="s-item__price">$20.00</span></li>
      <li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/123456789015"><span class="s-item__title">Sony WH1000XM4 headphones</span></a><span class="s-item__price">$200.00</span></li>
    </ul>`);
    expect(parseOffers(doc, product, 'ebay')).toMatchObject([{ price: 250 }]);
  });

  it('only accepts Best Buy open-box cards and safe product links', () => {
    const doc = page(`<ul>
      <li class="sku-item"><h4 class="sku-title">Sony WH-1000XM5 Headphones</h4><a href="/product/sony-wh1000xm5/sku/1234567/openbox">View</a><div class="priceView-customer-price">$299.99</div><span>Open-Box Excellent</span></li>
      <li class="sku-item"><h4 class="sku-title">Sony WH-1000XM5 Headphones</h4><a href="/product/sony-wh1000xm5/sku/1234568">View</a><div class="priceView-customer-price">$280.00</div><span>New</span></li>
      <li class="sku-item"><h4 class="sku-title">Sony WH-1000XM5 Headphones</h4><a href="https://evil.example/product/sku/1234569/openbox">View</a><div class="priceView-customer-price">$250.00</div><span>Open-Box</span></li>
    </ul>`);
    expect(parseOffers(doc, product, 'bestbuy')).toMatchObject([{ price: 299.99, condition: 'Open-Box Excellent' }]);
  });

  it('matches the Samsung SSD base model but rejects the wrong capacity', () => {
    const samsung: Product = { ...product, title: 'Samsung SSD 990 PRO 2TB, PCIe 4.0', brand: 'Samsung', model: 'MZ-V9P2T0B/AM', price: 389.99 };
    const doc = page(`<ul>
      <li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/123456789012"><span class="s-item__title">Samsung 990 PRO 2TB MZ-V9P2T0B used</span></a><span class="s-item__price">$240.00</span></li>
      <li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/123456789013"><span class="s-item__title">Samsung 990 PRO 1TB MZ-V9P2T0B used</span></a><span class="s-item__price">$220.00</span></li>
    </ul>`);
    expect(parseOffers(doc, samsung, 'ebay')).toMatchObject([{ price: 240 }]);
  });

  it('rejects EVO Plus for 990 PRO, cleans eBay title noise, and deduplicates tracked item links', () => {
    const samsung: Product = { ...product, title: 'Samsung SSD 990 PRO 2TB, PCIe 4.0', brand: 'Samsung', model: 'MZ-V9P2T0B/AM', price: 389.99 };
    const doc = page(`<ul>
      <li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/840129198715?_skw=Samsung"><span class="s-item__title">Samsung 990 EVO Plus 2TB PCIe NVMe M.2 Internal SSD</span></a><span class="s-item__price">$147.50</span></li>
      <li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/237184539819?itmmeta=abc"><span class="s-item__title">Samsung 990 PRO 2TB MZ-V9P2T0B PCIe 4.0 NVMe SSD Opens in a new window or tab</span></a><span class="s-item__price">$166.00</span></li>
      <li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/237184539819?itmmeta=def"><span class="s-item__title">Samsung 990 PRO 2TB MZ-V9P2T0B PCIe 4.0 NVMe SSD Opens in a new window or tabPre-Owned</span></a><span class="s-item__price">$166.00</span></li>
    </ul>`);
    expect(parseOffers(doc, samsung, 'ebay')).toMatchObject([{ price: 166, title: 'Samsung 990 PRO 2TB MZ-V9P2T0B PCIe 4.0 NVMe SSD', url: 'https://www.ebay.com/itm/237184539819' }]);
  });

  it('requires a numbered model variant beyond the Samsung example', () => {
    const controller: Product = { ...product, title: 'GameSir X5 Lite Mobile Gaming Controller', brand: 'GameSir', model: 'X5 Lite', price: 34.99 };
    const doc = page(`<ul>
      <li class="s-item"><a href="https://www.ebay.com/itm/123456789012"><span class="s-item__title">GameSir X5 Mobile Gaming Controller</span></a><span class="s-item__price">$20.00</span></li>
      <li class="s-item"><a href="https://www.ebay.com/itm/123456789013"><span class="s-item__title">GameSir X5 Lite Mobile Gaming Controller</span></a><span class="s-item__price">$21.00</span></li>
    </ul>`);
    expect(parseOffers(doc, controller, 'ebay')).toMatchObject([{ price: 21 }]);
  });

  it('can match a distinctive title variant when Amazon omits a model and GTIN', () => {
    const controller: Product = { ...product, title: 'GameSir X5 Lite Mobile Gaming Controller', brand: 'GameSir', model: undefined, gtin: undefined, price: 34.99 };
    expect(canMatchFromTitle(controller)).toBe(true);
    expect(canMatchFromTitle({ ...controller, brand: undefined })).toBe(false);
    const doc = page(`<li class="s-item"><a href="https://www.ebay.com/itm/123456789013"><span class="s-item__title">GameSir X5 Lite Mobile Gaming Controller</span></a><span class="s-item__price">$21.00</span></li>`);
    expect(parseOffers(doc, controller, 'ebay')).toMatchObject([{ price: 21 }]);
  });

  it('does not claim an exact GPU match when the seller omits the part number', () => {
    const gpu: Product = { ...product, title: 'XFX Swift AMD Radeon RX 9070XT Triple Fan Gaming Edition with 16GB GDDR6', brand: 'XFX', model: 'RX-97TSWF3BA', price: 959.99 };
    const doc = page('<li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/123456789012"><span class="s-item__title">XFX Swift Radeon RX 9070XT 16GB used</span></a><span class="s-item__price">$699.99</span></li>');
    expect(parseOffers(doc, gpu, 'ebay')).toHaveLength(0);
  });

  it('does not match a different RAM speed from the same product family', () => {
    const ram: Product = { ...product, title: 'CORSAIR Vengeance DDR5 32GB (2 x 16GB) Up to 6000MHz', brand: 'CORSAIR', model: 'CMK32GX5M2B6000Z30', price: 499.99 };
    const doc = page(`<ul>
      <li class="s-item"><a href="https://www.ebay.com/itm/123456789012"><span class="s-item__title">Corsair Vengeance DDR5 32GB 2x16GB 5600MHz</span></a><span class="s-item__price">$305.00</span></li>
      <li class="s-item"><a href="https://www.ebay.com/itm/123456789013"><span class="s-item__title">Corsair Vengeance DDR5 32GB 2x16GB 6000MHz CMK32GX5M2B6000Z30</span></a><span class="s-item__price">$315.00</span></li>
    </ul>`);
    expect(parseOffers(doc, ram, 'ebay')).toMatchObject([{ price: 315 }]);
  });

  it('reads a newer card layout from a rendered eBay search page', () => {
    const doc = page('<li class="s-card"><a href="https://www.ebay.com/itm/123456789012"><h3 class="s-card__title">Sony WH-1000XM5 headphones used</h3></a><span class="s-card__price">$250.00</span></li>');
    expect(parseOffers(doc, product, 'ebay')).toMatchObject([{ price: 250 }]);
  });

  it('reads a rendered Best Buy open-box card', () => {
    const doc = page('<div class="shop-sku-list-item"><h4 class="sku-title">Sony WH-1000XM5 Headphones</h4><a href="/product/sony/sku/1234567/openbox">View item</a><div class="priceView-customer-price"><span>$279.99</span></div><span>Open-Box Good</span></div>');
    expect(parseOffers(doc, product, 'bestbuy')).toMatchObject([{ price: 279.99 }]);
  });
});
