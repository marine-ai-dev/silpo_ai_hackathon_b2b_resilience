import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolated DB file so this test file can run concurrently with other test
// files that also touch the JSON store (Node's test runner parallelizes
// across files by default) without clobbering data/db.json.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.SILPO_DB_FILE = path.join(__dirname, '.tmp-powerProviders-db.json');

const { resetDatabase, collections } = await import('../src/repositories/jsonStore.js');
const { ManualScheduleProvider, ManualScheduleProviderError } = await import('../src/power/ManualScheduleProvider.js');
const { DemoScheduleProvider } = await import('../src/power/DemoScheduleProvider.js');
const { getEffectivePowerSchedule } = await import('../src/power/index.js');

beforeEach(() => {
  resetDatabase();
  collections.offices.insert({ id: 'office-test', name: 'Test Office', address: { text: 'вул. Тест 1, Київ' }, memberCount: 5 });
});

test('ManualScheduleProvider: no record -> unknown, honest UNAVAILABLE-ish shape', async () => {
  const provider = new ManualScheduleProvider();
  const result = await provider.getSchedule('office-test');
  assert.equal(result.currentStatus, 'unknown');
  assert.equal(result.nextOutage, null);
  assert.equal(result.source, 'MANUAL');
});

test('ManualScheduleProvider: rejects start >= end', () => {
  const provider = new ManualScheduleProvider();
  assert.throws(() => provider.setSchedule('office-test', { start: '2026-09-04T14:00:00+03:00', end: '2026-09-04T14:00:00+03:00' }), ManualScheduleProviderError);
  assert.throws(() => provider.setSchedule('office-test', { start: '2026-09-04T18:00:00+03:00', end: '2026-09-04T14:00:00+03:00' }), ManualScheduleProviderError);
});

test('ManualScheduleProvider: rejects non-date input, never produces NaN/Invalid Date', () => {
  const provider = new ManualScheduleProvider();
  assert.throws(() => provider.setSchedule('office-test', { start: 'not-a-date', end: '2026-09-04T18:00:00+03:00' }), ManualScheduleProviderError);
  assert.throws(() => provider.setSchedule('office-test', { start: '2026-09-04T14:00:00+03:00', end: null }), ManualScheduleProviderError);
});

test('ManualScheduleProvider: valid window persists and reads back correctly', async () => {
  const provider = new ManualScheduleProvider();
  provider.setSchedule('office-test', { start: '2026-09-04T14:00:00+03:00', end: '2026-09-04T18:00:00+03:00', note: 'Scheduled outage' });
  const result = await provider.getSchedule('office-test');
  assert.equal(result.nextOutage.start, new Date('2026-09-04T14:00:00+03:00').toISOString());
  assert.equal(result.confidence, 'high');
  assert.equal(Number.isNaN(new Date(result.nextOutage.end).getTime()), false);
});

test('DemoScheduleProvider: no seed -> unavailable/unknown, app stays functional', async () => {
  const provider = new DemoScheduleProvider();
  const result = await provider.getSchedule('office-with-no-demo-seed');
  assert.equal(result.currentStatus, 'unknown');
  // Honestly UNAVAILABLE, not DEMO — no demo data actually exists for this
  // office, and the UI badge must not claim otherwise.
  assert.equal(result.source, 'UNAVAILABLE');
});

test('DemoScheduleProvider: seeded active window -> active_blackout', async () => {
  const now = Date.now();
  DemoScheduleProvider.seed('office-test', {
    start: new Date(now - 3600000).toISOString(),
    end: new Date(now + 3600000).toISOString(),
    note: 'demo blackout'
  });
  const provider = new DemoScheduleProvider();
  const result = await provider.getSchedule('office-test');
  assert.equal(result.currentStatus, 'active_blackout');
});

test('getEffectivePowerSchedule: MANUAL record overrides DEMO default', async () => {
  const manual = new ManualScheduleProvider();
  manual.setSchedule('office-test', { start: '2026-09-04T14:00:00+03:00', end: '2026-09-04T18:00:00+03:00' });
  DemoScheduleProvider.seed('office-test', { start: '2099-01-01T00:00:00Z', end: '2099-01-02T00:00:00Z' });
  const result = await getEffectivePowerSchedule('office-test');
  assert.equal(result.source, 'MANUAL');
});

test('getEffectivePowerSchedule: no MANUAL, no DEMO -> unavailable, no throw', async () => {
  const result = await getEffectivePowerSchedule('office-with-no-schedule-at-all');
  assert.equal(result.currentStatus, 'unknown');
  // Must be honestly labeled UNAVAILABLE, not DEMO or MANUAL — there is no
  // data of any kind for this office, and the UI's sourceBadge() renders
  // whatever this field says verbatim as the provenance badge.
  assert.equal(result.source, 'UNAVAILABLE');
  assert.equal(result.lastUpdatedAt, null);
});
