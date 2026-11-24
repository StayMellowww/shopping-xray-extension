import { afterEach, describe, expect, it, vi } from 'vitest';
import { enqueueWrite } from './storageWrites';
import { amazonReviewId, captureAmazonReviews, readCapturedReviews, storeCapturedReviews, REVIEW_CAPTURE_KEY } from './reviewCapture';

const page = (body: string) => new DOMParser().parseFromString(`<div data-hook="review"><i data-hook="review-star-rating">1 out of 5 stars</i><span data-hook="review-body">${body}</span></div>`, 'text/html');

describe('review tab capture', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts only Amazon review tabs and adds each visible batch once', async () => {
    expect(amazonReviewId(new URL('https://www.amazon.com/product-reviews/B0BHJJ9Y77?filterByStar=one_star'))).toBe('B0BHJJ9Y77');
    expect(amazonReviewId(new URL('https://evil.example/product-reviews/B0BHJJ9Y77'))).toBeUndefined();
    const data: Record<string, unknown> = {};
    vi.stubGlobal('chrome', { runtime: { sendMessage: async ({ id, reviews }: { id: string; reviews: Parameters<typeof storeCapturedReviews>[1] }) => ({ ok: true, value: await enqueueWrite(() => storeCapturedReviews(id, reviews)) }) }, storage: { local: {
      get: vi.fn(async () => structuredClone(data)),
      set: vi.fn(async (next: Record<string, unknown>) => Object.assign(data, next)),
    } } });
    const id = 'B0BHJJ9Y77';
    expect(await captureAmazonReviews(page('The drive failed after two weeks of use.'), id)).toBe(1);
    expect(await captureAmazonReviews(page('The drive failed after two weeks of use.'), id)).toBe(0);
    expect(await captureAmazonReviews(page('Firmware update caused a serious problem.'), id)).toBe(1);
    expect(await readCapturedReviews(id)).toHaveLength(2);
    await Promise.all([
      captureAmazonReviews(page('Easy to install and it works perfectly.'), id),
      captureAmazonReviews(page('The second unit also arrived damaged.'), id),
    ]);
    expect(await readCapturedReviews(id)).toHaveLength(4);
    const stored = data[REVIEW_CAPTURE_KEY] as Record<string, { at: number }>;
    stored[id].at = Date.now() - 86_400_001;
    expect(await readCapturedReviews(id)).toEqual([]);
    expect(await captureAmazonReviews(page('The drive failed after two weeks of use.'), id)).toBe(1);
    expect(await readCapturedReviews(id)).toHaveLength(1);
  });
});
