import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { PricePoint, Product } from './model';
import { savePrice } from './history';
import { collectReviews, type ReviewCollection } from './reviewCollector';
import { analyzeReviews, mergeReviewPages, type ReviewAnalysis } from './reviews';
import { ReviewHighlights } from './ReviewHighlights';
import { extractRetailerSummary, type RetailerSummary } from './retailerSummary';
import { lookupOffers, mergeCapturedOffers, type OfferLookup, type SourceStatus } from './offerCollector';
import { crossStoreSearches } from './offers';
import { CAPTURE_KEY } from './searchCapture';
import { REVIEW_CAPTURE_KEY, readCapturedReviews } from './reviewCapture';
import { extractPromotions, type Promotion } from './promotions';

function money(price: number, currency = 'USD'): string {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price); }
  catch { return `${price.toFixed(2)} ${currency}`; }
}

function Section({ title, eyebrow, tone, hasData, children }: { title: string; eyebrow: string; tone: 'teal' | 'blue' | 'violet' | 'amber'; hasData: boolean | undefined; children: ReactNode }) {
  const [expanded, setExpanded] = useState(hasData === true);
  const userToggled = useRef(false);
  const id = useId();
  useEffect(() => { if (!userToggled.current && hasData !== undefined) setExpanded(hasData); }, [hasData]);
  return <section className={`xray-section xray-${tone}`}>
    <button type="button" className="xray-section-button" aria-expanded={expanded} aria-controls={id} onClick={() => { userToggled.current = true; setExpanded(value => !value); }}>
      <span><span className="xray-eyebrow">{eyebrow}</span><span className="xray-section-title">{title}</span></span>
      <span aria-hidden="true" className="xray-chevron">{expanded ? '−' : '+'}</span>
    </button>
    {expanded && <div id={id} className="xray-section-body">{children}</div>}
  </section>;
}

function Sparkline({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return <p className="xray-muted">Price history starts with today’s snapshot.</p>;
  const values = points.map(point => point.price);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const path = values.map((value, index) => `${index ? 'L' : 'M'} ${(index / (values.length - 1)) * 280} ${44 - ((value - min) / span) * 36}`).join(' ');
  return <div>
    <svg aria-label="Local price history" role="img" viewBox="0 0 280 52" className="h-14 w-full overflow-visible"><path d={path} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <div className="flex justify-between text-xs text-slate-700"><span>{points[0].at}</span><span>{points.at(-1)?.at}</span></div>
  </div>;
}

function statusText(status: SourceStatus): string {
  switch (status) {
    case 'matched': return 'Priced matches found';
    case 'no-match': return 'Results loaded; no confident match';
    case 'unreadable': return 'Results page could not be read';
    case 'unavailable': return 'Store blocked or timed out';
    case 'not-searched': return 'Needs a model or GTIN';
  }
}

export function App({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [reviewCollection, setReviewCollection] = useState<ReviewCollection>();
  const [reviewAnalysis, setReviewAnalysis] = useState<ReviewAnalysis>();
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [retailerSummary, setRetailerSummary] = useState<RetailerSummary>();
  const [offerLookup, setOfferLookup] = useState<OfferLookup>();
  const [offersLoading, setOffersLoading] = useState(false);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const searchTargets = crossStoreSearches(product);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setPromotions(extractPromotions(document));
    setRetailerSummary(extractRetailerSummary(document, product.store));
    savePrice(product).then(value => { if (active) setPoints(value); }).catch(() => { if (active) setHistoryError(true); });
    return () => { active = false; };
  }, [open, product]);

  useEffect(() => {
    if (!open || retailerSummary || product.store === 'ebay') return;
    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        const found = extractRetailerSummary(document, product.store);
        if (found) { setRetailerSummary(found); observer.disconnect(); }
      }, 500);
    });
    observer.observe(document.body, { subtree: true, childList: true });
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [open, product.store, retailerSummary]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setReviewsLoading(true);
    collectReviews(document, product).then(async collection => {
      if (!active) return;
      const captured = product.store === 'amazon' ? await readCapturedReviews(product.id).catch(() => []) : [];
      if (!active) return;
      const merged = { ...collection, reviews: mergeReviewPages(collection.reviews, captured) };
      setReviewCollection(merged);
      setReviewAnalysis(analyzeReviews(merged.reviews, { ratingCount: product.ratingCount, targeted: merged.targeted }));
    }).catch(() => {
      if (active) setReviewAnalysis(analyzeReviews([], { ratingCount: product.ratingCount }));
    }).finally(() => { if (active) setReviewsLoading(false); });
    return () => { active = false; };
  }, [open, product]);

  useEffect(() => {
    if (!open || product.store !== 'amazon') return;
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[REVIEW_CAPTURE_KEY]) return;
      void readCapturedReviews(product.id).then(captured => {
        setReviewCollection(current => {
          if (!current) return current;
          const reviews = mergeReviewPages(current.reviews, captured);
          if (reviews.length === current.reviews.length) return current;
          return { ...current, reviews };
        });
      }).catch(() => {});
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [open, product]);

  useEffect(() => {
    if (reviewCollection) setReviewAnalysis(analyzeReviews(reviewCollection.reviews, { ratingCount: product.ratingCount, targeted: reviewCollection.targeted }));
  }, [reviewCollection, product.ratingCount]);

  useEffect(() => {
    if (!open || product.store !== 'amazon') return;
    let active = true;
    setOffersLoading(true);
    lookupOffers(product).then(result => { if (active) setOfferLookup(result); }).finally(() => { if (active) setOffersLoading(false); });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session' || !changes[CAPTURE_KEY]) return;
      setOfferLookup(previous => {
        if (previous) mergeCapturedOffers(previous, product).then(updated => { if (active) setOfferLookup(updated); });
        return previous;
      });
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => { active = false; chrome.storage.onChanged.removeListener(onChanged); };
  }, [open, product]);

  return <div className="xray-app">
    <button type="button" aria-label={open ? 'Close Shopping X-Ray' : 'Open Shopping X-Ray'} aria-expanded={open} onClick={() => setOpen(value => !value)} className={`xray-tab ${open ? 'xray-tab-open' : ''}`}><span aria-hidden="true">✦</span> {open ? 'Close' : 'X-Ray'}</button>
    {open && <aside aria-label="Shopping X-Ray product details" className="xray-panel">
      <header className="xray-header"><p className="xray-header-kicker">SHOPPING X-RAY</p><h2>Make sense of this listing</h2><p>Product facts, review samples, and used prices in one place.</p></header>
      <div className="xray-content">
        <section className="xray-product"><p className="xray-store">{product.store}</p><h3>{product.title}</h3><p className="xray-price-label">Current page price</p><p className="xray-price">{product.price === undefined ? 'Unavailable' : money(product.price, product.currency)}</p>
          <dl className="xray-specs"><div><dt>Brand</dt><dd>{product.brand || 'Unknown'}</dd></div><div><dt>Model</dt><dd>{product.model || 'Unknown'}</dd></div><div><dt>GTIN</dt><dd>{product.gtin || 'Unknown'}</dd></div></dl>
        </section>

        <Section title="Promotions" eyebrow={promotions.length ? 'On this page' : 'None found'} tone="amber" hasData={promotions.length > 0}>
          {promotions.length ? <ul className="xray-promotions">{promotions.map((promotion, index) => <li key={`${promotion.text}-${index}`}><strong>{promotion.kind === 'coupon' ? 'Coupon' : promotion.kind === 'code' ? 'Claim code' : 'Promotion'}</strong><p>{promotion.text}</p>{promotion.code && <code>{promotion.code}</code>}</li>)}</ul> : <p className="xray-muted">No coupon or claim code was visible in the product details this extension could read.</p>}
          <p className="xray-footnote">Check eligibility and the final discount at checkout. X-Ray does not test codes or apply coupons.</p>
        </Section>

        <Section title="Price history" eyebrow={points.length > 1 ? 'On this device' : 'One or no snapshots'} tone="teal" hasData={points.length > 1}>
          {product.store === 'ebay' ? <p className="xray-muted">eBay prices are not saved on this device.</p> : historyError ? <p className="xray-muted">Could not save this price.</p> : product.price === undefined ? <p className="xray-muted">No readable price on this page.</p> : <Sparkline points={points} />}
          {product.store === 'amazon' && <div className="xray-external"><p>For earlier Amazon prices, open a third-party chart:</p><div className="xray-links"><a href={`https://keepa.com/#!product/1-${product.id}`} target="_blank" rel="noopener noreferrer">View on Keepa ↗</a><a href={`https://camelcamelcamel.com/product/${product.id}`} target="_blank" rel="noopener noreferrer">View on camelcamelcamel ↗</a></div><p>Those charts are separate from the local snapshots above.</p></div>}
        </Section>

        <Section title="Search other stores" eyebrow="Two store searches" tone="blue" hasData={true}>
          <div className="xray-links">{searchTargets.map(target => <a key={target.store} href={target.url} target="_blank" rel="noopener noreferrer">{target.label} ↗</a>)}</div>
          {(product.model || product.gtin) && <details className="xray-more"><summary>Search by exact model or GTIN</summary><div className="xray-links">{searchTargets.map(target => <a key={target.store} href={target.modelUrl} target="_blank" rel="noopener noreferrer">{target.modelLabel} ↗</a>)}</div></details>}
          <p className="xray-footnote">Searches may include other variants. Confirm the model, condition, and final price on the store page.</p>
        </Section>

        {product.store === 'amazon' && <Section title="Used & open-box" eyebrow={offerLookup?.offers.length ? 'Priced matches' : offerLookup ? 'No priced match' : 'Checking stores'} tone="blue" hasData={offerLookup ? offerLookup.offers.length > 0 : undefined}>
          {offersLoading && <p className="xray-muted" role="status">Checking marketplaces…</p>}
          {offerLookup && <>
            {offerLookup.offers.length > 0 ? <ul className="xray-offers">{offerLookup.offers.map(offer => <li key={offer.url}><a href={offer.url} target="_blank" rel="noopener noreferrer">{offer.title} ↗</a><div><strong>{money(offer.price + (offer.shipping ?? 0), offer.currency)} {offer.shipping === undefined ? 'item price' : 'with shipping'}</strong>{offer.savingsPercent !== undefined && <span>{offer.savingsPercent}% less</span>}</div><small>{offer.marketplace === 'ebay' ? 'eBay' : 'Best Buy'} · {offer.condition} · {offer.shipping === undefined ? 'Shipping unknown' : `${money(offer.price)} item + ${money(offer.shipping)} shipping`}</small></li>)}</ul> : <p className="xray-muted">{offerLookup.status.ebay === 'not-searched' ? 'No model number or GTIN was found for automatic matching. Use the store search buttons above.' : 'No verified priced offer was found automatically. Use the store search buttons above to check current listings.'}</p>}
            <dl className="xray-status"><div><dt>eBay</dt><dd>{statusText(offerLookup.status.ebay)}</dd></div><div><dt>Best Buy</dt><dd>{statusText(offerLookup.status.bestbuy)}</dd></div></dl>
            {offerLookup.ebayApiError && <p className="xray-footnote">eBay API: {offerLookup.ebayApiError} Search links remain available above.</p>}
            {offerLookup.ebayApiConnected && <p className="xray-footnote">eBay API connected. Listings are checked against this product before display.</p>}
            <p className="xray-footnote">If a store blocks the background lookup, open its search button above and return here. X-Ray can read visible listings in that tab.</p>
            <p className="xray-footnote">Savings compare the item and quoted shipping with the current page price, before tax. Confirm delivery costs for your address.</p>
          </>}
        </Section>}

        <Section title="Review signals" eyebrow={reviewAnalysis ? reviewAnalysis.sampled ? `${reviewAnalysis.sampled} written reviews` : 'No written reviews' : 'Reading reviews'} tone="violet" hasData={reviewAnalysis ? reviewAnalysis.sampled > 0 : undefined}>
          {reviewsLoading && <p className="xray-muted" role="status">Reading available reviews…</p>}
          {reviewAnalysis && <>
            <p className="xray-muted">Analyzed <strong>{reviewAnalysis.sampled} written reviews</strong>, including {reviewAnalysis.critical} rated 1–3 stars.{product.ratingCount !== undefined && <> This page reports {product.ratingCount.toLocaleString()} ratings, which may include ratings without text.</>}</p>
            {reviewCollection && reviewCollection.attemptedPages > 0 && <p className="xray-footnote">Automatic requests added {reviewCollection.newReviewsFromPages} unique reviews from {reviewCollection.fetchedPages} of {reviewCollection.attemptedPages} attempted pages. Duplicate pages do not count as new.{reviewCollection.fetchedPages === 0 && ' The store may block background requests.'}</p>}
            <p className={`xray-verdict ${reviewAnalysis.status === 'caution' ? 'xray-caution' : ''}`}>{reviewAnalysis.status === 'insufficient' ? 'Limited sample — no reliable risk verdict' : reviewAnalysis.status === 'caution' ? 'Patterns worth checking' : 'No unusual pattern in this sample'}</p>
            {reviewAnalysis.signals.length > 0 && <ul className="xray-signal-list">{reviewAnalysis.signals.map(signal => <li key={signal}>{signal}</li>)}</ul>}
            <ReviewHighlights analysis={reviewAnalysis} />
            <h4 className="xray-subheading">Possible review incentives</h4>
            {reviewAnalysis.incentiveMentions.count ? <div className="xray-incentive"><strong>{reviewAnalysis.incentiveMentions.count} sampled {reviewAnalysis.incentiveMentions.count === 1 ? 'review mentions' : 'reviews mention'} an incentive with a review.</strong><blockquote>“{reviewAnalysis.incentiveMentions.example}”</blockquote><p>This is a reviewer’s statement, not verification of a seller offer.</p></div> : <p className="xray-muted">No explicit incentive mention found in this sample.</p>}
            {product.store === 'amazon' && <p className="xray-footnote">Open Amazon reviews and use its view-more control. Newly visible written reviews are added while that tab is open.</p>}
            {product.store === 'amazon' && <div className="xray-links"><a href={`https://www.amazon.com/product-reviews/${product.id}?filterByStar=one_star`} target="_blank" rel="noopener noreferrer">Open one-star reviews ↗</a><a href={`https://www.amazon.com/product-reviews/${product.id}?filterByStar=five_star`} target="_blank" rel="noopener noreferrer">Open five-star reviews ↗</a></div>}
            <p className="xray-footnote">Signals describe this sample; they cannot prove reviews are genuine or fake.</p>
          </>}
        </Section>

        {(retailerSummary || product.store === 'amazon') && <Section title={product.store === 'bestbuy' ? 'Best Buy “Customers are saying”' : 'Amazon “Customers say”'} eyebrow={retailerSummary ? 'Retailer-generated summary' : 'Not visible on page'} tone="amber" hasData={!!retailerSummary}>
          <p className="xray-muted">{retailerSummary?.text || 'No retailer summary was readable on this page.'}</p>
          <p className="xray-footnote"><strong>Use caution:</strong> When shown, this summary is generated by {retailerSummary?.source || 'Amazon'}, may be inaccurate, and is separate from the written reviews X-Ray counted above.</p>
        </Section>}

        <p className="xray-privacy">Non-eBay price snapshots stay on this device. eBay offers are kept in memory during this browser session.</p>
      </div>
    </aside>}
  </div>;
}
