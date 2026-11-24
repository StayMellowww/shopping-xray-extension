import { useEffect, useState } from 'react';
import { readCapturedReviews, REVIEW_CAPTURE_KEY } from './reviewCapture';
import { analyzeReviews, mergeReviewPages, extractReviews, type Review } from './reviews';
import { ReviewHighlights } from './ReviewHighlights';
import { extractRetailerSummary } from './retailerSummary';

export function ReviewPageApp({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reviews, setReviews] = useState<Review[]>(() => extractReviews(document, 'amazon'));
  const summary = extractRetailerSummary(document, 'amazon');
  const analysis = analyzeReviews(reviews, { targeted: true });

  useEffect(() => {
    let active = true;
    const refresh = () => void readCapturedReviews(id).then(captured => {
      if (active) setReviews(current => mergeReviewPages(current, captured));
    }).catch(() => {});
    refresh();
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[REVIEW_CAPTURE_KEY]) refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { active = false; chrome.storage.onChanged.removeListener(changed); };
  }, [id]);

  return <div className="xray-app">
    <button type="button" aria-label={open ? 'Close Shopping X-Ray' : 'Open Shopping X-Ray'} aria-expanded={open} onClick={() => setOpen(value => !value)} className={`xray-tab ${open ? 'xray-tab-open' : ''}`}><span aria-hidden="true">✦</span> {open ? 'Close' : 'X-Ray'}</button>
    {open && <aside aria-label="Shopping X-Ray review sample" className="xray-panel">
      <header className="xray-header"><p className="xray-header-kicker">SHOPPING X-RAY</p><h2>Review browser</h2><p>Read more reviews on Amazon and watch the sample grow here.</p></header>
      <div className="xray-content">
        <section className="xray-product"><p className="xray-store">Amazon · {id}</p><h3>Written review sample</h3><p className="xray-muted"><strong>{analysis.sampled} reviews analyzed</strong> · {analysis.critical} rated 1–3 stars · {analysis.positive} rated 4–5 stars</p><div className="xray-links"><a href={`https://www.amazon.com/dp/${id}`}>Back to product ↗</a><a href={`https://www.amazon.com/product-reviews/${id}?filterByStar=five_star`}>View five-star reviews ↗</a><a href={`https://www.amazon.com/product-reviews/${id}?filterByStar=one_star`}>View one-star reviews ↗</a></div></section>
        <section className="xray-section xray-violet"><div className="xray-section-body"><ReviewHighlights analysis={analysis} /><p className="xray-footnote">Use Amazon’s view-more control to add visible written reviews. The sample is saved on this device for one day, up to 500 reviews per product.</p></div></section>
        {summary && <section className="xray-section xray-amber"><div className="xray-section-body"><h3 className="xray-subheading">Amazon “Customers say”</h3><p className="xray-muted">{summary.text}</p><p className="xray-footnote"><strong>Use caution:</strong> Amazon generates this summary. It may be inaccurate and is separate from X-Ray’s counted reviews.</p></div></section>}
      </div>
    </aside>}
  </div>;
}
