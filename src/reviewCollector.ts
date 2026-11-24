import type { Product } from './model';
import { extractReviews, mergeReviewPages, reviewPageLink, type Review } from './reviews';

export interface ReviewCollection {
  reviews: Review[];
  visibleCount: number;
  fetchedPages: number;
  attemptedPages: number;
  newReviewsFromPages: number;
  targeted: boolean;
}

const amazonFilters = ['one_star', 'two_star', 'three_star', 'five_star'] as const;

async function fetchReviewPage(url: string, product: Product): Promise<Document | undefined> {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'shopping-xray:fetch-reviews', url, productId: product.id }) as { html?: string };
    return result.html ? new DOMParser().parseFromString(result.html, 'text/html') : undefined;
  } catch { return undefined; }
}

export async function collectReviews(doc: Document, product: Product, pageUrl = new URL(location.href)): Promise<ReviewCollection> {
  let reviews = extractReviews(doc, product.store);
  const visibleCount = reviews.length;
  let fetchedPages = 0;
  let attemptedPages = 0;
  let newReviewsFromPages = 0;
  if (product.store === 'amazon') {
    const base = pageUrl;
    for (const filter of amazonFilters) {
      const url = new URL(`/product-reviews/${product.id}`, base);
      url.searchParams.set('filterByStar', filter);
      url.searchParams.set('pageNumber', '1');
      attemptedPages++;
      const fetched = await fetchReviewPage(url.href, product);
      if (!fetched) continue;
      const pageReviews = extractReviews(fetched, product.store);
      if (!pageReviews.length) continue;
      const merged = mergeReviewPages(reviews, pageReviews);
      if (merged.length === reviews.length) continue;
      fetchedPages++;
      newReviewsFromPages += merged.length - reviews.length;
      reviews = merged;
    }
    return { reviews, visibleCount, fetchedPages, attemptedPages, newReviewsFromPages, targeted: true };
  }
  const visited: string[] = [];
  let current = doc;
  let base = pageUrl;
  for (let page = 0; page < 2; page++) {
    const link = reviewPageLink(current, product, base, visited);
    if (!link) break;
    visited.push(link);
    attemptedPages++;
    const fetched = await fetchReviewPage(link, product);
    if (!fetched) break;
    const pageReviews = extractReviews(fetched, product.store);
    if (!pageReviews.length) break;
    const merged = mergeReviewPages(reviews, pageReviews);
    if (merged.length === reviews.length) break;
    fetchedPages++;
    newReviewsFromPages += merged.length - reviews.length;
    reviews = merged;
    current = fetched;
    base = new URL(link);
  }
  return { reviews, visibleCount, fetchedPages, attemptedPages, newReviewsFromPages, targeted: false };
}

