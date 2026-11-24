import { describe, expect, it } from 'vitest';
import { extractPromotions } from './promotions';

describe('on-page promotions', () => {
  it('reads visible coupon and claim-code text without inventing codes', () => {
    const doc = new DOMParser().parseFromString('<div id="couponFeature">Save 10% with this coupon</div><div id="promotions_feature_div">Use promo code SAVE20 at checkout</div><div hidden data-testid="coupon">Use code HIDDEN</div>', 'text/html');
    expect(extractPromotions(doc)).toMatchObject([{ kind: 'coupon' }, { kind: 'code', code: 'SAVE20' }]);
  });
});
