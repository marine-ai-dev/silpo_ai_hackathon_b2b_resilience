import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecast } from '../src/agents/demandAgent.js';

const office = { id: 'off-1', memberCount: 20 };
const supplyPlan = {
  items: [
    { productKey: 'water', label: 'Water', category: 'water', unit: 'l', targetProductQuery: 'water' },
    { productKey: 'coffee', label: 'Coffee', category: 'coffee', unit: 'kg', targetProductQuery: 'coffee' }
  ]
};

test('baseline uses trailing average of consumption history', () => {
  const history = [
    { officeId: 'off-1', productKey: 'water', quantity: 30, weekOf: '2026-08-11' },
    { officeId: 'off-1', productKey: 'water', quantity: 40, weekOf: '2026-08-18' },
    { officeId: 'off-1', productKey: 'coffee', quantity: 2, weekOf: '2026-08-18' }
  ];
  const result = forecast(office, supplyPlan, history, [], 20, '2026-08-25');
  const water = result.items.find((i) => i.productKey === 'water');
  assert.equal(water.previousQty, 35); // (30+40)/2
});

test('cold start falls back to a category default when there is no history', () => {
  const result = forecast(office, supplyPlan, [], [], 20, '2026-08-25');
  const coffee = result.items.find((i) => i.productKey === 'coffee');
  assert.ok(coffee.forecastQty > 0);
  assert.match(coffee.rationale, /Cold-start/);
});

test('scales quantity up when expected attendance exceeds member count', () => {
  const history = [{ officeId: 'off-1', productKey: 'water', quantity: 40, weekOf: '2026-08-18' }];
  const normal = forecast(office, supplyPlan, history, [], 20, '2026-08-25');
  const scaled = forecast(office, supplyPlan, history, [], 30, '2026-08-25'); // 1.5x attendance
  const wNormal = normal.items.find((i) => i.productKey === 'water').forecastQty;
  const wScaled = scaled.items.find((i) => i.productKey === 'water').forecastQty;
  assert.ok(wScaled > wNormal, `expected ${wScaled} > ${wNormal}`);
});

test('NOT_ENOUGH feedback increases forecast quantity by ~20%', () => {
  const history = [{ officeId: 'off-1', productKey: 'water', quantity: 40, weekOf: '2026-08-18' }];
  const noFeedback = forecast(office, supplyPlan, history, [], 20, '2026-08-25');
  const withFeedback = forecast(
    office,
    supplyPlan,
    history,
    [{ officeId: 'off-1', productKey: 'water', weekOf: '2026-08-24', signal: 'NOT_ENOUGH' }],
    20,
    '2026-08-25'
  );
  const before = noFeedback.items.find((i) => i.productKey === 'water').forecastQty;
  const after = withFeedback.items.find((i) => i.productKey === 'water').forecastQty;
  assert.ok(after > before, `expected ${after} > ${before}`);
  assert.match(withFeedback.items.find((i) => i.productKey === 'water').rationale, /NOT_ENOUGH/);
});

test('TOO_MUCH feedback decreases forecast quantity but never below essential floor', () => {
  const history = [{ officeId: 'off-1', productKey: 'water', quantity: 40, weekOf: '2026-08-18' }];
  const withFeedback = forecast(
    office,
    supplyPlan,
    history,
    [{ officeId: 'off-1', productKey: 'water', weekOf: '2026-08-24', signal: 'TOO_MUCH' }],
    20,
    '2026-08-25'
  );
  const after = withFeedback.items.find((i) => i.productKey === 'water').forecastQty;
  assert.ok(after < 40, `expected ${after} < 40`);
  assert.ok(after >= 1);
});

test('JUST_RIGHT feedback applies no adjustment', () => {
  const history = [{ officeId: 'off-1', productKey: 'water', quantity: 40, weekOf: '2026-08-18' }];
  const withFeedback = forecast(
    office,
    supplyPlan,
    history,
    [{ officeId: 'off-1', productKey: 'water', weekOf: '2026-08-24', signal: 'JUST_RIGHT' }],
    20,
    '2026-08-25'
  );
  const after = withFeedback.items.find((i) => i.productKey === 'water').forecastQty;
  assert.equal(after, 40);
});
