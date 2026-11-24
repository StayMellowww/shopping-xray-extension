import type { PricePoint, Product } from './model';
import type { Review } from './reviews';

type Write = { type: 'shopping-xray:save-price'; product: Product } |
  { type: 'shopping-xray:save-reviews'; id: string; reviews: Review[] };

export function requestStorageWrite(message: Extract<Write, { product: Product }>): Promise<PricePoint[]>;
export function requestStorageWrite(message: Extract<Write, { reviews: Review[] }>): Promise<number>;
export async function requestStorageWrite(message: Write): Promise<number | PricePoint[]> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error('Could not save shopping data.');
  return response.value;
}

// Used only by the single extension service worker. Finish each read/modify/write
// before starting the next, including after a failed storage operation.
let pending = Promise.resolve();
export function enqueueWrite<T>(write: () => Promise<T>): Promise<T> {
  const result = pending.then(write);
  pending = result.then(() => {}, () => {});
  return result;
}
