import { describe, expect, it } from 'vitest';
import { analyzeReviews, extractReviews, mergeReviewPages, reviewPageLink, type Review } from './reviews';

it('reconciles anonymous and identified copies while preserving different review IDs', () => {
  const anonymous = { rating: 5, text: 'Very comfortable pillow.' };
  const identified = { ...anonymous, id: 'first', verified: true };
  expect(mergeReviewPages([anonymous], [identified])).toEqual([identified]);
  expect(mergeReviewPages([identified], [anonymous])).toEqual([identified]);
  expect(mergeReviewPages([identified], [{ ...identified, id: 'second' }])).toHaveLength(2);
});
import type { Product } from './model';

const product: Product = { store: 'amazon', id: 'B012345678', url: 'https://www.amazon.com/dp/B012345678', title: 'Widget', searchQuery: 'Widget' };
const page = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('review analysis', () => {
  it('extracts critical Amazon reviews and recurring complaints', () => {
    const doc = page(`<div data-hook="review"><i data-hook="review-star-rating"><span>1.0 out of 5 stars</span></i><span data-hook="review-body">The battery dies quickly after a week of use.</span><span data-hook="review-date">Reviewed on January 2, 2026</span><span data-hook="avp-badge">Verified Purchase</span></div>
      <div data-hook="review"><i data-hook="review-star-rating"><span>2.0 out of 5 stars</span></i><span data-hook="review-body">My battery dies quickly every time I use it.</span></div>`);
    const reviews = extractReviews(doc, 'amazon');
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({ rating: 1, verified: true, date: '2026-01-02' });
    expect(analyzeReviews(reviews).complaints).toMatchObject([{ label: 'Product failure or defects', mentions: 2 }]);
    expect(analyzeReviews(reviews).complaints[0].excerpts).toHaveLength(2);
  });

  it('only raises date and wording signals with a substantial sample', () => {
    const repeated: Review[] = Array.from({ length: 10 }, (_, index) => ({ rating: 5, text: index < 3 ? 'Excellent quality, works exactly as promised every day.' : `Excellent quality, works exactly as promised on day ${index}.`, date: '2026-01-02' }));
    expect(analyzeReviews(repeated).signals).toEqual(expect.arrayContaining(['Many sampled reviews share one date', 'Repeated review wording in the sample']));
    expect(analyzeReviews(repeated.slice(0, 4)).status).toBe('insufficient');
    expect(analyzeReviews(repeated, { ratingCount: 320 }).status).toBe('insufficient');
  });

  it('limits review links to the same origin and product', () => {
    const doc = page('<a href="https://bad.example/reviews/B012345678">Bad</a><a href="/product-reviews/B012345678">All reviews</a>');
    expect(reviewPageLink(doc, product, new URL(product.url))).toBe('https://www.amazon.com/product-reviews/B012345678');
  });

  it('does not count the same review twice across pages', () => {
    const review: Review = { rating: 1, text: 'The battery dies quickly after a week of use.', date: '2026-01-02' };
    expect(mergeReviewPages([review], [review])).toHaveLength(1);
    expect(mergeReviewPages([review], [review, review])).toHaveLength(1);
  });

  it('finds issue categories and incentive mentions without counting product names as complaints', () => {
    const reviews: Review[] = [
      { rating: 1, text: 'Cons: Samsung Magician software would not recognize the SSD. The drive failed after two weeks.' },
      { rating: 2, text: 'The software had problems and the drive stopped working. Seller offered a gift card for a 5-star review.' },
      { rating: 5, text: 'Samsung Magician works well for me, and I like this product.' },
      { rating: 5, text: 'I received this free product through Vine for an honest review.' },
    ];
    const result = analyzeReviews(reviews);
    expect(result.complaints.map(item => item.label)).toContain('Setup or compatibility');
    expect(result.complaints.map(item => item.label)).toContain('Product failure or defects');
    expect(result.complaints.some(item => item.label === 'Samsung Magician')).toBe(false);
    expect(result.incentiveMentions).toMatchObject({ count: 1 });
  });

  it('summarizes supported pros separately from complaints', () => {
    const result = analyzeReviews([
      { rating: 5, text: 'Installation was easy and the performance is excellent.' },
      { rating: 5, text: 'Easy setup and fast performance every day.' },
      { rating: 1, text: 'The memory module failed after two weeks.' },
    ]);
    expect(result.positive).toBe(2);
    expect(result.pros.map(item => item.label)).toContain('Function or performance');
    expect(result.complaints.map(item => item.label)).toContain('Product failure or defects');
  });

  it('quotes the phrase about each theme, including cons inside a positive review', () => {
    const result = analyzeReviews([
      { rating: 5, text: 'Easy to install, looks nice, and good enough for gaming. Cons: the firmware update failed after a week.' },
    ]);
    expect(result.pros.find(item => item.label === 'Ease of use or setup')?.example).toBe('Easy to install');
    expect(result.pros.find(item => item.label === 'Appearance')?.example).toBe('looks nice');
    expect(result.complaints.find(item => item.label === 'Product failure or defects')?.example).toContain('failed after a week');
  });

  it('does not treat hypothetical praise, negative value, or old-product comparisons as current-product praise or defects', () => {
    const result = analyzeReviews([
      { rating: 2, text: "If it works well. Overall the morning headaches aren't worth it. I stay comfortable instead of overheating like I did with my old pillow. Why it failed for me: Arm Numbness." },
      { rating: 1, text: "The slow cooker function on low doesnt get warm." },
      { rating: 5, text: 'Going back to sleep was pretty fast.' },
    ]);
    expect(result.pros.some(item => item.label === 'Reliability')).toBe(false);
    expect(result.pros.some(item => item.label === 'Value')).toBe(false);
    expect(result.pros.some(item => item.label === 'Function or performance')).toBe(false);
    expect(result.complaints.map(item => item.label)).toContain('Comfort or fit');
    expect(result.complaints.map(item => item.label)).toContain('Value or listing accuracy');
    expect(result.complaints.some(item => item.label === 'Temperature')).toBe(false);
    expect(result.complaints.some(item => item.label === 'Product failure or defects')).toBe(false);
  });

  it('treats none are worth the price as a complaint rather than a pro', () => {
    const result = analyzeReviews([{ rating: 1, text: 'None are worth what they charge.' }]);
    expect(result.pros.some(item => item.label === 'Value')).toBe(false);
    expect(result.complaints.find(item => item.label === 'Value or listing accuracy')?.example).toBe('None are worth what they charge.');
  });

  it('avoids praise for instability, figurative cool, smooth monitors, and star ratings', () => {
    const result = analyzeReviews([
      { rating: 1, text: 'I was unable to get the ram to run stable so I will be returning it.' },
      { rating: 3, text: 'I feel like the concept is cool.' },
      { rating: 4, text: 'My 1440p 300hz ips is ultra smooth by comparison.' },
      { rating: 1, text: "It's really not even worth 1 star." },
    ]);
    expect(result.pros.map(item => item.label)).not.toContain('Reliability');
    expect(result.pros.map(item => item.label)).not.toContain('Cooling or temperature');
    expect(result.pros.map(item => item.label)).not.toContain('Taste or texture');
    expect(result.complaints.map(item => item.label)).not.toContain('Value or listing accuracy');
  });

  it('does not mistake a dead zone, setup complaint or unrelated price reference for praise or a different issue', () => {
    const result = analyzeReviews([{ rating: 1, text: "The motor is pretty quiet.The nightmare begins when I install G Hub. The dead spot in the middle makes it too difficult to be precise. At this price point I don't want to send it away." }]);
    expect(result.pros.some(item => item.label === 'Ease of use or setup')).toBe(false);
    expect(result.complaints.some(item => item.label === 'Product failure or defects')).toBe(false);
    expect(result.complaints.some(item => item.label === 'Value or listing accuracy')).toBe(false);
  });

  it('does not report desired comfort or reliability as praise, or a neutral price as a complaint', () => {
    const result = analyzeReviews([
      { rating: 2, text: 'I would have to rotate the mouse almost sideways to get a comfortable grip.' },
      { rating: 2, text: "I'd just rather purchase something that is reliable." },
      { rating: 1, text: 'For its current price of $150.' },
    ]);
    expect(result.pros.some(item => item.label === 'Comfort or fit' || item.label === 'Reliability')).toBe(false);
    expect(result.complaints.some(item => item.label === 'Value or listing accuracy')).toBe(false);
  });
});
