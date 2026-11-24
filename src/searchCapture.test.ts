import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureSearchPage, readCapturedOffers, registerSearchContext } from './searchCapture';
import { offerSearch } from './offers';
import type { Product } from './model';

const product: Product = { store: 'amazon', id: 'B0BHJJ9Y77', url: 'https://www.amazon.com/dp/B0BHJJ9Y77', title: 'Samsung SSD 990 PRO 2TB', searchQuery: 'Samsung MZ-V9P2T0B/AM', brand: 'Samsung', model: 'MZ-V9P2T0B/AM', price: 389.99 };

describe('rendered search-page capture', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves a matching used listing after the user opens an X-Ray search link', async () => {
    const data: Record<string, unknown> = {};
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async () => ({ ok: true })) }, storage: { session: {
      get: vi.fn(async (key: string) => ({ [key]: data[key] })),
      set: vi.fn(async (values: Record<string, unknown>) => Object.assign(data, values)),
    } } });
    await registerSearchContext(product);
    const url = new URL(offerSearch(product).ebay);
    const doc = new DOMParser().parseFromString('<li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/123456789012"><span class="s-item__title">Samsung SSD 990 PRO 2TB MZ-V9P2T0B used</span></a><span class="s-item__price">$249.99</span></li>', 'text/html');
    expect(await captureSearchPage(doc, url)).toBe(true);
    expect((await readCapturedOffers(product)).ebay).toMatchObject([{ price: 249.99 }]);
  });
});
