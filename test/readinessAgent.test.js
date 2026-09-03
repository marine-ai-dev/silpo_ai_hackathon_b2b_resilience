import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeShortfall, computeShortfalls } from '../src/agents/readinessAgent.js';

const item = { id: 'ri-1', label: 'Батарейки AA', targetQuantity: 20, unit: 'шт', category: 'readiness' };

test('computeShortfall: no stock check ever recorded -> full target as shortfall', () => {
  const result = computeShortfall(item, []);
  assert.equal(result.mostRecentKnownQuantity, 0);
  assert.equal(result.shortfall, 20);
  assert.equal(result.lastCheckedAt, null);
});

test('computeShortfall: partial stock -> correct gap', () => {
  const stockChecks = [
    { readinessItemId: 'ri-1', currentQuantity: 4, checkedAt: '2026-08-20T10:00:00Z' }
  ];
  const result = computeShortfall(item, stockChecks);
  assert.equal(result.mostRecentKnownQuantity, 4);
  assert.equal(result.shortfall, 16);
});

test('computeShortfall: stock at or above target -> zero shortfall, never negative', () => {
  const atTarget = [{ readinessItemId: 'ri-1', currentQuantity: 20, checkedAt: '2026-08-20T10:00:00Z' }];
  assert.equal(computeShortfall(item, atTarget).shortfall, 0);

  const aboveTarget = [{ readinessItemId: 'ri-1', currentQuantity: 35, checkedAt: '2026-08-20T10:00:00Z' }];
  assert.equal(computeShortfall(item, aboveTarget).shortfall, 0);
});

test('computeShortfall: uses the most recent stock check, not the first/oldest', () => {
  const stockChecks = [
    { readinessItemId: 'ri-1', currentQuantity: 20, checkedAt: '2026-08-01T10:00:00Z' },
    { readinessItemId: 'ri-1', currentQuantity: 4, checkedAt: '2026-08-25T10:00:00Z' }
  ];
  const result = computeShortfall(item, stockChecks);
  assert.equal(result.mostRecentKnownQuantity, 4);
  assert.equal(result.shortfall, 16);
});

test('computeShortfalls: computes across multiple items independently', () => {
  const items = [
    { id: 'a', label: 'A', targetQuantity: 10 },
    { id: 'b', label: 'B', targetQuantity: 5 }
  ];
  const checks = [
    { readinessItemId: 'a', currentQuantity: 2, checkedAt: '2026-08-20T10:00:00Z' },
    { readinessItemId: 'b', currentQuantity: 8, checkedAt: '2026-08-20T10:00:00Z' }
  ];
  const results = computeShortfalls(items, checks);
  assert.equal(results.find((r) => r.readinessItemId === 'a').shortfall, 8);
  assert.equal(results.find((r) => r.readinessItemId === 'b').shortfall, 0);
});
