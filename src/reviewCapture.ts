import { extractReviews, mergeReviewPages, type Review } from './reviews';
import { requestStorageWrite } from './storageWrites';

export const REVIEW_CAPTURE_KEY = 'shopping-xray:captured-reviews:v1';

type Capture = { reviews: Review[]; at: number };

export function amazonReviewId(url: URL): string | undefined {
  if (!/(^|\.)amazon\.com$/i.test(url.hostname)) return undefined;
  return url.pathname.match(/^\/product-reviews\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase();
}

export async function captureAmazonReviews(doc: Document, id: string): Promise<number> {
  const visible = extractReviews(doc, 'amazon');
  if (!visible.length) return 0;
  return requestStorageWrite({ type: 'shopping-xray:save-reviews', id, reviews: visible });
}

export async function storeCapturedReviews(id: string, visible: Review[]): Promise<number> {
  const result = await chrome.storage.local.get(REVIEW_CAPTURE_KEY);
  const captures: Record<string, Capture> = result[REVIEW_CAPTURE_KEY] || {};
  const prior = captures[id];
  const existing = prior && Date.now() - prior.at < 86_400_000 ? prior.reviews : [];
  const merged = mergeReviewPages(existing, visible).slice(0, 500);
  const added = merged.length - existing.length;
  if (!added && merged.every((review, index) => review === existing[index])) return 0;
  captures[id] = { reviews: merged, at: Date.now() };
  const recent = Object.entries(captures).filter(([, value]) => Date.now() - value.at < 86_400_000)
    .sort((a, b) => b[1].at - a[1].at).slice(0, 10);
  await chrome.storage.local.set({ [REVIEW_CAPTURE_KEY]: Object.fromEntries(recent) });
  return Math.max(0, added);
}

export async function readCapturedReviews(id: string): Promise<Review[]> {
  const result = await chrome.storage.local.get(REVIEW_CAPTURE_KEY);
  const captures: Record<string, Capture> = result[REVIEW_CAPTURE_KEY] || {};
  const found = captures[id];
  return found && Date.now() - found.at < 86_400_000 ? found.reviews : [];
}
