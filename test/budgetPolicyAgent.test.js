import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPolicy } from '../src/agents/budgetPolicyAgent.js';

function draftProposal(items) {
  return {
    officeId: 'off-1',
    weekOf: '2026-09-07',
    status: 'draft',
    items,
    totalEstimated: items.reduce((s, i) => s + i.lineTotal, 0),
    budgetCheck: {},
    history: []
  };
}

test('strips items in banned categories', async () => {
  const proposal = draftProposal([
    { productKey: 'a', label: 'A', category: 'alcohol', silpoProductId: 'p1', unitPrice: 100, quantity: 1, lineTotal: 100, onPromotion: false },
    { productKey: 'b', label: 'B', category: 'water', silpoProductId: 'p2', unitPrice: 50, quantity: 2, lineTotal: 100, onPromotion: false }
  ]);
  const budget = { weeklyBudgetUAH: 1000 };
  const policy = { maxPerCategoryUAH: {}, bannedCategorySlugs: ['alcohol'], preferPromotions: false };
  const result = await applyPolicy(proposal, budget, policy, null, null);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].category, 'water');
  assert.equal(result.status, 'pending_approval');
});

test('trims an over-budget proposal to at-or-under the weekly budget', async () => {
  const proposal = draftProposal([
    { productKey: 'a', label: 'Coffee', category: 'coffee', silpoProductId: 'p1', unitPrice: 500, quantity: 5, lineTotal: 2500, onPromotion: false, previousQty: 2 },
    { productKey: 'b', label: 'Snacks', category: 'snacks', silpoProductId: 'p2', unitPrice: 80, quantity: 10, lineTotal: 800, onPromotion: false, previousQty: 8 }
  ]);
  const budget = { weeklyBudgetUAH: 1000 };
  const policy = { maxPerCategoryUAH: {}, bannedCategorySlugs: [], preferPromotions: false };
  const result = await applyPolicy(proposal, budget, policy, null, null);
  assert.ok(result.totalEstimated <= budget.weeklyBudgetUAH, `expected total ${result.totalEstimated} <= 1000`);
  assert.equal(result.budgetCheck.withinBudget, true);
  for (const item of result.items) assert.ok(item.quantity >= 1);
});

test('enforces per-category cap by trimming quantity', async () => {
  const proposal = draftProposal([
    { productKey: 'a', label: 'Coffee', category: 'coffee', silpoProductId: 'p1', unitPrice: 500, quantity: 5, lineTotal: 2500, onPromotion: false, previousQty: 2 }
  ]);
  const budget = { weeklyBudgetUAH: 5000 };
  const policy = { maxPerCategoryUAH: { coffee: 1000 }, bannedCategorySlugs: [], preferPromotions: false };
  const result = await applyPolicy(proposal, budget, policy, null, null);
  const coffeeTotal = result.items.filter((i) => i.category === 'coffee').reduce((s, i) => s + i.lineTotal, 0);
  assert.ok(coffeeTotal <= 1000, `expected coffee subtotal ${coffeeTotal} <= 1000`);
});

test('never trims essential water category below its floor', async () => {
  const proposal = draftProposal([
    { productKey: 'water', label: 'Water', category: 'water', silpoProductId: 'p1', unitPrice: 90, quantity: 40, lineTotal: 3600, onPromotion: false, previousQty: 40 }
  ]);
  const budget = { weeklyBudgetUAH: 100 }; // impossibly small on purpose
  const policy = { maxPerCategoryUAH: {}, bannedCategorySlugs: [], preferPromotions: false };
  const result = await applyPolicy(proposal, budget, policy, null, null);
  assert.equal(result.items[0].quantity, 12); // essential floor from budgetPolicyAgent
  assert.equal(result.budgetCheck.withinBudget, false);
  assert.ok(result.budgetCheck.notes.some((n) => /over budget/.test(n)));
});
