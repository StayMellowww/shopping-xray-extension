import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ReviewPageApp } from './ReviewPageApp';
import { detectStore, extractProduct } from './adapters';
import { captureSearchPage, isSearchPage } from './searchCapture';
import { amazonReviewId, captureAmazonReviews } from './reviewCapture';
import styles from './style.css?inline';

let mountedUrl = '';
let host: HTMLElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;
let captureTimer: number | undefined;
let reviewCaptureTimer: number | undefined;

function scheduleReviewCapture(url: URL): void {
  const id = amazonReviewId(url);
  if (!id) return;
  if (reviewCaptureTimer) clearTimeout(reviewCaptureTimer);
  reviewCaptureTimer = window.setTimeout(() => {
    reviewCaptureTimer = undefined;
    if (amazonReviewId(new URL(location.href)) === id) void captureAmazonReviews(document, id).catch(() => {});
  }, 400);
}

function startSearchCapture(url: URL): void {
  if (captureTimer) clearInterval(captureTimer);
  if (!isSearchPage(url)) return;
  let attempts = 0;
  let busy = false;
  captureTimer = window.setInterval(async () => {
    if (location.href !== url.href || attempts++ >= 15) { clearInterval(captureTimer); captureTimer = undefined; return; }
    if (busy) return;
    busy = true;
    try {
      if (await captureSearchPage(document, url)) { clearInterval(captureTimer); captureTimer = undefined; }
    } catch { /* A store page may change while it renders. */ }
    finally { busy = false; }
  }, 1000);
}

function mount(): void {
  if (location.href === mountedUrl) return;
  root?.unmount();
  host?.remove();
  root = undefined;
  host = undefined;
  const url = new URL(location.href);
  scheduleReviewCapture(url);
  const reviewId = amazonReviewId(url);
  if (reviewId) {
    mountedUrl = location.href;
    host = document.createElement('div');
    host.id = 'shopping-xray-root';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = styles;
    shadow.append(style);
    const app = document.createElement('div');
    shadow.append(app);
    document.documentElement.append(host);
    root = createRoot(app);
    root.render(<React.StrictMode><ReviewPageApp id={reviewId} /></React.StrictMode>);
    return;
  }
  if (!detectStore(url)) {
    mountedUrl = location.href;
    startSearchCapture(url);
    return;
  }
  if (captureTimer) { clearInterval(captureTimer); captureTimer = undefined; }
  const product = extractProduct(document, url);
  if (!product) return;
  mountedUrl = location.href;
  host = document.createElement('div');
  host.id = 'shopping-xray-root';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  shadow.append(style);
  const app = document.createElement('div');
  shadow.append(app);
  document.documentElement.append(host);
  root = createRoot(app);
  root.render(<React.StrictMode><App product={product} /></React.StrictMode>);
}

mount();
window.addEventListener('popstate', mount);
window.addEventListener('hashchange', mount);
const observer = new MutationObserver(() => {
  if (location.href !== mountedUrl) mount();
  else scheduleReviewCapture(new URL(location.href));
});
observer.observe(document.documentElement, { subtree: true, childList: true });
