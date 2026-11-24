import type { Complaint, ReviewAnalysis } from './reviews';

function Items({ items, count, empty }: { items: Complaint[]; count: number; empty: string }) {
  if (!items.length) return <p className="xray-muted">{count ? empty : 'No written reviews were available.'}</p>;
  return <ul className="xray-complaints">{items.map(item => <li key={item.label}><strong>{item.label}</strong> · {item.mentions} {item.mentions === 1 ? 'review' : 'reviews'}<blockquote>“{item.example}”</blockquote></li>)}</ul>;
}

export function ReviewHighlights({ analysis }: { analysis: ReviewAnalysis }) {
  return <div className="xray-review-highlights">
    <h4 className="xray-subheading">Reported pros</h4>
    <Items items={analysis.pros} count={analysis.sampled} empty="No clear positive theme was found in this sample." />
    <h4 className="xray-subheading">Reported cons</h4>
    <Items items={analysis.complaints} count={analysis.sampled} empty="No clear complaint was found in this sample." />
    <p className="xray-footnote">Themes come from the quoted phrases, including mixed reviews. A review can mention more than one theme. Star-filtered samples can overrepresent one side.</p>
  </div>;
}
