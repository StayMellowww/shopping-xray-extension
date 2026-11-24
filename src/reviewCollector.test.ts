import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectReviews } from './reviewCollector';
import type { Product } from './model';

const product: Product = { store: 'amazon', id: 'B0BHJJ9Y77', url: 'https://www.amazon.com/dp/B0BHJJ9Y77', title: 'Samsung SSD', searchQuery: 'Samsung SSD' };
const page = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const review = (rating: number, body: string) => `<div data-hook="review"><i data-hook="review-star-rating"><span>${rating} out of 5 stars</span></i><span data-hook="review-body">${body}</span></div>`;

describe('Amazon review collection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tries one, two, three, and five star pages and reports fetch coverage', async () => {
    const sendMessage = vi.fn(async (message: { url: string }) => message.url.includes('two_star')
      ? { error: 'blocked' }
      : { html: review(1, 'This drive stopped working after a month of use.') });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const result = await collectReviews(page(review(5, 'Fast and reliable for my computer every day.')), product, new URL(product.url));
    expect(result).toMatchObject({ visibleCount: 1, attemptedPages: 4, fetchedPages: 1, newReviewsFromPages: 1, targeted: true });
    expect(result.reviews).toHaveLength(2);
    expect(sendMessage).toHaveBeenCalledTimes(4);
  });

});
