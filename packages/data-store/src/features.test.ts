import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedStorageModes, canUseFeature, PAID_FEATURES } from './features.ts';

test('free accounts cannot use any paid feature and stay local', () => {
  for (const feature of PAID_FEATURES) assert.equal(canUseFeature({ tier: 'free' }, feature), false);
  assert.deepEqual(allowedStorageModes({ tier: 'free' }), ['local']);
  assert.deepEqual(allowedStorageModes(null), ['local']);
});

test('the cloud plan unlocks every paid feature and cloud storage', () => {
  for (const feature of PAID_FEATURES) assert.equal(canUseFeature({ tier: 'cloud' }, feature), true);
  assert.deepEqual(allowedStorageModes({ tier: 'cloud' }), ['local', 'cloud']);
});

test('a grant unlocks only the named feature', () => {
  const plan = { tier: 'free' as const, grants: ['portal_links' as const] };
  assert.equal(canUseFeature(plan, 'portal_links'), true);
  assert.equal(canUseFeature(plan, 'payment_links'), false);
  assert.deepEqual(allowedStorageModes(plan), ['local']);
});
