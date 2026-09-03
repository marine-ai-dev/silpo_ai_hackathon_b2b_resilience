import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolated DB file — see test/powerProviders.test.js for why.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.SILPO_DB_FILE = path.join(__dirname, '.tmp-resiliencePlanner-db.json');

const { resetDatabase, collections } = await import('../src/repositories/jsonStore.js');
const { buildOfficeResiliencePlan } = await import('../src/resilience/resiliencePlanner.js');
const { ManualScheduleProvider } = await import('../src/power/ManualScheduleProvider.js');
const { SilpoGateway } = await import('../src/silpo/SilpoGateway.js');
const { MockSilpoMcpClient } = await import('../src/silpo/MockSilpoMcpClient.js');

function makeGateway() {
  return new SilpoGateway(new MockSilpoMcpClient());
}

beforeEach(() => {
  resetDatabase();
  collections.offices.insert({ id: 'office-a', name: 'Office A', address: { text: 'вул. Хрещатик 1, Київ' }, memberCount: 10 });
});

test('resiliencePlan: office not found throws', async () => {
  await assert.rejects(() => buildOfficeResiliencePlan('nope', makeGateway()));
});

test('resiliencePlan: no schedule, no readiness items -> NORMAL, no NaN anywhere', async () => {
  const plan = await buildOfficeResiliencePlan('office-a', makeGateway());
  assert.equal(plan.risk.level, 'UNKNOWN'); // no schedule data at all -> unknown, honest
  assert.equal(plan.situation.readiness.totalShortfall, 0);
  assert.equal(Number.isNaN(plan.situation.readiness.totalShortfall), false);
  assert.equal(plan.procurement.wouldRecommendTopUp, false);
});

test('resiliencePlan: scenario A shape — imminent outage + shortfall -> PREPARE/HIGH, deadline before outage', async () => {
  collections.readinessItems.insert({ id: 'ri-1', officeId: 'office-a', label: 'Батарейки', category: 'readiness', unit: 'шт', targetQuantity: 20 });
  collections.readinessStockChecks.insert({ officeId: 'office-a', readinessItemId: 'ri-1', currentQuantity: 2, checkedAt: new Date().toISOString() });

  const manual = new ManualScheduleProvider();
  const start = new Date(Date.now() + 18 * 3600000).toISOString();
  const end = new Date(Date.now() + 22 * 3600000).toISOString();
  manual.setSchedule('office-a', { start, end, note: 'Scheduled outage' });

  const plan = await buildOfficeResiliencePlan('office-a', makeGateway());
  assert.ok(['PREPARE', 'HIGH', 'WATCH'].includes(plan.risk.level));
  assert.equal(plan.procurement.wouldRecommendTopUp, true);
  assert.ok(plan.timing.deliveryWindow);
  assert.equal(Number.isNaN(new Date(plan.timing.procurementDeadline).getTime()), false);

  // Impact Summary metrics — deterministic, computed from the same data.
  assert.equal(plan.metrics.categoriesBelowTarget, 1);
  assert.equal(plan.metrics.categoriesTotal, 1);
  // target 20, current 2 -> covered 2/20 = 10%
  assert.equal(plan.metrics.stockCoveragePercent, 10);
  assert.equal(Number.isNaN(plan.metrics.procurementLeadTimeHours), false);
  assert.ok(plan.metrics.procurementLeadTimeHours > 0, 'lead time should be positive when the deadline is in the future');
});

test('resiliencePlan metrics: stock coverage caps at real data, never exceeds 100% or goes negative', async () => {
  collections.readinessItems.insert({ id: 'ri-cov-1', officeId: 'office-a', label: 'Item A', category: 'readiness', unit: 'шт', targetQuantity: 10 });
  collections.readinessStockChecks.insert({ officeId: 'office-a', readinessItemId: 'ri-cov-1', currentQuantity: 999, checkedAt: new Date().toISOString() }); // way over target
  collections.readinessItems.insert({ id: 'ri-cov-2', officeId: 'office-a', label: 'Item B', category: 'readiness', unit: 'шт', targetQuantity: 10 });
  // no stock check for item B at all -> treated as 0 current, full shortfall
  const plan = await buildOfficeResiliencePlan('office-a', makeGateway());
  assert.ok(plan.metrics.stockCoveragePercent >= 0 && plan.metrics.stockCoveragePercent <= 100, `coverage must be clamped to [0,100], got ${plan.metrics.stockCoveragePercent}`);
  assert.equal(Number.isNaN(plan.metrics.stockCoveragePercent), false);
});

test('resiliencePlan metrics: no readiness items at all -> coverage is null, not NaN or 0-by-accident', async () => {
  // beforeEach resets the DB and only inserts the office itself — no
  // readiness items exist yet at this point in a fresh test.
  const plan = await buildOfficeResiliencePlan('office-a', makeGateway());
  assert.equal(plan.metrics.stockCoveragePercent, null);
  assert.equal(plan.metrics.categoriesTotal, 0);
});

test('resiliencePlan: regional blackout active overrides to ACTIVE_BLACKOUT even without a matching schedule', async () => {
  collections.regionalBlackoutStatuses.insert({ officeId: 'office-a', active: true, setBy: 'test', setAt: new Date().toISOString(), note: '' });
  const plan = await buildOfficeResiliencePlan('office-a', makeGateway());
  assert.equal(plan.risk.level, 'ACTIVE_BLACKOUT');
});

test('resiliencePlan: readiness already at target -> shortfall 0, plan says so plainly', async () => {
  collections.readinessItems.insert({ id: 'ri-2', officeId: 'office-a', label: 'Свічки', category: 'readiness', unit: 'шт', targetQuantity: 5 });
  collections.readinessStockChecks.insert({ officeId: 'office-a', readinessItemId: 'ri-2', currentQuantity: 5, checkedAt: new Date().toISOString() });
  const plan = await buildOfficeResiliencePlan('office-a', makeGateway());
  assert.equal(plan.situation.readiness.totalShortfall, 0);
  assert.equal(plan.procurement.wouldRecommendTopUp, false);
  assert.match(plan.procurement.note, /No shortfall/);
});

test('resiliencePlan: office with no address degrades logistics gracefully, no throw', async () => {
  collections.offices.insert({ id: 'office-no-addr', name: 'No Address Office', memberCount: 3 });
  const plan = await buildOfficeResiliencePlan('office-no-addr', makeGateway());
  assert.equal(plan.logistics.available, false);
  assert.ok(plan.logistics.reason);
});

test('resiliencePlan: recycling stats surfaced, no fabricated CO2 figures anywhere', async () => {
  collections.recyclingLogEntries.insert({ officeId: 'office-a', quantity: 10, loggedBy: 'x', loggedAt: new Date().toISOString(), note: '' });
  const plan = await buildOfficeResiliencePlan('office-a', makeGateway());
  assert.equal(plan.esg.totalRecycled, 10);
  assert.equal(JSON.stringify(plan).toLowerCase().includes('co2'), false);
  assert.equal(JSON.stringify(plan).toLowerCase().includes('co₂'), false);
});
